/**
 * Course export-related js.
 */
define([
    'jquery', 'underscore', 'gettext', 'moment', 'common/js/components/views/feedback_prompt', 'jquery.cookie'
    ],
    function($, _, gettext, moment, PromptView) {
        'use strict';

        /** ******** Private properties ****************************************/

        var COOKIE_NAME = 'lastexport';

        var STAGE = {
            'PREPARING': 0,
            'EXPORTING': 1,
            'COMPRESSING': 2,
            'SUCCESS': 3
        };

        var STATE = {
            'READY': 1,
            'IN_PROGRESS': 2,
            'SUCCESS': 3,
            'ERROR': 4
        };

        var current = {stage: 0, state: STATE.READY, downloadUrl: null};
        var deferred = null;
        var is_library = false;
        var statusUrl = null;
        var timeout = {id: null, delay: 1000};
        var $dom = {
            downloadLink: $('#download-exported-button'),
            stages: $('ol.status-progress').children(),
            successStage: $('.item-progresspoint-success'),
            wrapper: $('div.wrapper-status')
        };

        /** ******** Private functions *****************************************/

        /**
         * Makes Export feedback status list visible
         *
         */
        var displayFeedbackList = function() {
            $dom.wrapper.removeClass('is-hidden');
        };

        /**
         * Sets the Export in the "error" status.
         *
         * Immediately stops any further polling from the server.
         * Displays the error message at the list element that corresponds
         * to the stage where the error occurred.
         *
         * @param {string} msg Error message to display.
         * @param {int} [stage=current.stage] Stage of export process at which error occurred.
         */
        var error = function(msg, stage) {
            current.stage = Math.abs(stage || current.stage); // Could be negative
            current.state = STATE.ERROR;

            clearTimeout(timeout.id);
            updateFeedbackList(msg);

            deferred.resolve();
        };

        /**
         * Show a dialog giving further information about the details of an export error.
         *
         * @param {string} editUnitUrl URL of the unit in which the error occurred, if known
         * @param {string} errMsg Detailed error message
         */
        var showError = function (editUnitUrl, errMsg) {
            var dialog;
            if (editUnitUrl) {
                dialog = new PromptView({
                    title: gettext('There has been an error while exporting.'),
                    message: gettext('There has been a failure to export to XML at least one component. It is recommended that you go to the edit page and repair the error before attempting another export. Please check that all components on the page are valid and do not display any error messages.'),
                    intent: 'error',
                    actions: {
                        primary: {
                            text: gettext('Correct failed component'),
                            click: function (view) {
                                view.hide();
                                document.location = editUnitUrl;
                            }
                        },
                        secondary: {
                            text: gettext('Return to Export'),
                            click: function (view) {
                                view.hide();
                            }
                        }
                    }
                });
            } else {
                var msg = '';
                var action;
                if (is_library) {
                    msg += gettext('Your library could not be exported to XML. There is not enough information to identify the failed component. Inspect your library to identify any problematic components and try again.');
                    action = gettext('Take me to the main library page');
                } else {
                    msg += gettext('Your course could not be exported to XML. There is not enough information to identify the failed component. Inspect your course to identify any problematic components and try again.');
                    action = gettext('Take me to the main course page');
                }
                msg += ' ' + gettext('The raw error message is:') + ' ' + errMsg;
                dialog = new PromptView({
                    title: gettext('There has been an error with your export.'),
                    message: msg,
                    intent: 'error',
                    actions: {
                        primary: {
                            text: action,
                            click: function (view) {
                                view.hide();
                                document.location = courselikeHomeUrl;
                            }
                        },
                        secondary: {
                            text: gettext('Cancel'),
                            click: function (view) {
                                view.hide();
                            }
                        }
                    }
                });
            }

            // The CSS animation for the dialog relies on the 'js' class
            // being on the body. This happens after this JavaScript is executed,
            // causing a 'bouncing' of the dialog after it is initially shown.
            // As a workaround, add this class first.
            $('body').addClass('js');
            dialog.show();
        };

        /**
         * Stores in a cookie the current export data
         *
         * @param {boolean} [completed=false] If the export has been completed or not
         */
        var storeExport = function(completed) {
            $.cookie(COOKIE_NAME, JSON.stringify({
                statusUrl: statusUrl,
                date: moment().valueOf(),
                completed: completed || false
            }), {path: window.location.pathname});
        };

        /**
         * Sets the Export on the "success" status
         *
         * If it wasn't already, marks the stored export as "completed",
         * and updates its date timestamp
         */
        var success = function() {
            current.state = STATE.SUCCESS;

            if (CourseExport.storedExport().completed !== true) {
                storeExport(true);
            }

            updateFeedbackList();

            deferred.resolve();
        };

        /**
         * Updates the Export feedback status list
         *
         * @param {string} [currStageMsg=''] The message to show on the
         *   current stage (for now only in case of error)
         */
        var updateFeedbackList = function(currStageMsg) {
            var $checkmark, $curr, $prev, $next;
            var date, successUnix, time;

            $checkmark = $dom.successStage.find('.icon');
            currStageMsg = currStageMsg || '';

            function completeStage(stage) {
                $(stage)
                    .removeClass('is-not-started is-started')
                    .addClass('is-complete');
            }

            function errorStage(stage) {
                if (!$(stage).hasClass('has-error')) {
                    $(stage)
                        .removeClass('is-started')
                        .addClass('has-error')
                        .find('p.copy')
                        .hide()
                        .after("<p class='copy error'>" + currStageMsg + '</p>');
                }
            }

            function resetStage(stage) {
                $(stage)
                    .removeClass('is-complete is-started has-error')
                    .addClass('is-not-started')
                    .find('p.error').remove().end()
                    .find('p.copy').show();
            }

            switch (current.state) {
            case STATE.READY:
                _.map($dom.stages, resetStage);

                break;

            case STATE.IN_PROGRESS:
                $prev = $dom.stages.slice(0, current.stage);
                $curr = $dom.stages.eq(current.stage);

                _.map($prev, completeStage);
                $curr.removeClass('is-not-started').addClass('is-started');

                break;

            case STATE.SUCCESS:
                successUnix = CourseExport.storedExport().date;
                date = moment(successUnix).utc().format('MM/DD/YYYY');
                time = moment(successUnix).utc().format('HH:mm');

                _.map($dom.stages, completeStage);

                $dom.successStage
                        .find('.item-progresspoint-success-date')
                        .html('(' + date + ' at ' + time + ' UTC)');

                break;

            case STATE.ERROR:
                    // Make all stages up to, and including, the error stage 'complete'.
                $prev = $dom.stages.slice(0, current.stage + 1);
                $curr = $dom.stages.eq(current.stage);
                $next = $dom.stages.slice(current.stage + 1);

                _.map($prev, completeStage);
                _.map($next, resetStage);
                errorStage($curr);

                break;
            }

            if (current.state === STATE.SUCCESS) {
                $checkmark.removeClass('fa-square-o').addClass('fa-check-square-o');
                $dom.downloadLink.attr('href', current.downloadUrl);
            } else {
                $checkmark.removeClass('fa-check-square-o').addClass('fa-square-o');
                $dom.downloadLink.attr('href', '#');
            }
        };

        /** ******** Public functions ******************************************/

        var CourseExport = {

            /**
             * Cancels the export and sets the Object to the error state
             *
             * @param {string} msg Error message to display.
             * @param {int} stage Stage of export process at which error occurred.
             */
            cancel: function(msg, stage) {
                error(msg, stage);
            },

            /**
             * Entry point for server feedback
             *
             * Checks for export status updates every `timeout` milliseconds,
             * and updates the page accordingly.
             *
             * @param {int} [stage=0] Starting stage.
             */
            pollStatus: function(data) {
                var edit_unit_url = null,
                    msg = data;
                if (current.state !== STATE.IN_PROGRESS) {
                    return;
                }

                current.stage = data.ExportStatus || STAGE.PREPARING;

                if (current.stage === STAGE.SUCCESS) {
                    current.downloadUrl = data.ExportOutput;
                    success();
                } else if (current.stage < STAGE.PREPARING) { // Failed
                    if (data.ExportError) {
                        msg = data.ExportError;
                    }
                    if (msg.raw_error_msg) {
                        edit_unit_url = msg.edit_unit_url;
                        msg = msg.raw_error_msg;
                    }
                    error(msg);
                    showError(edit_unit_url, msg);
                } else { // In progress
                    updateFeedbackList();

                    $.getJSON(statusUrl, function(data) {
                        timeout.id = setTimeout(function() {
                            this.pollStatus(data);
                        }.bind(this), timeout.delay);
                    }.bind(this));
                }
            },

            /**
             * Resets the Export internally and visually
             *
             */
            reset: function(library) {
                current.stage = STAGE.PREPARING;
                current.state = STATE.READY;
                current.downloadUrl = null;
                is_library = library;

                clearTimeout(timeout.id);
                updateFeedbackList();
            },

            /**
             * Show last export status from server and start sending requests
             * to the server for status updates
             *
             * @return {jQuery promise}
             */
            resume: function(library) {
                deferred = $.Deferred();
                is_library = library;
                statusUrl = this.storedExport().statusUrl;

                $.getJSON(statusUrl, function(data) {
                    current.stage = data.ExportStatus;
                    current.downloadUrl = data.ExportOutput;

                    displayFeedbackList();
                    current.state = STATE.IN_PROGRESS;
                    this.pollStatus(data);
                }.bind(this));

                return deferred.promise();
            },

            /**
             * Starts the exporting process.
             * Makes status list visible and starts showing export progress.
             *
             * @param {string} url The full URL to use to query the server
             *     about the export status
             * @return {jQuery promise}
             */
            start: function(url) {
                current.state = STATE.IN_PROGRESS;
                deferred = $.Deferred();

                statusUrl = url;

                storeExport();
                displayFeedbackList();
                updateFeedbackList();

                return deferred.promise();
            },

            /**
             * Fetches the previous stored export
             *
             * @return {JSON} the data of the previous export
             */
            storedExport: function() {
                return JSON.parse($.cookie(COOKIE_NAME));
            }
        };

        return CourseExport;
    });
