
var ui_timer = (function () {

    var intervalHandle = null
    var fn = null

    return {
        start: function (seconds, ontick) {
            this.stop()
            fn = ontick
            intervalHandle = setInterval(fn, seconds * 1000)
            console.log(`ui timer started.`)
        },
        stop: function () {
            if (intervalHandle) {
                clearInterval(intervalHandle)
                console.log(`ui timer stopped. [${intervalHandle}]`)
                intervalHandle = null
            }
        },

    }
})()

var utils = (function () {
    return {
        /**
         * Gets current time in epoch seconds.
         * @returns Epoch in seconds
         */
        get_epoch_in_secs: function () {
            return Math.ceil(Date.now() / 1000)
        },

        /**
         * @returns Returns and empty activity object.
         */
        get_default_activity: function () {
            return {
                id: null,
                name: "",
                athlete: "",
                can_kudo: false,
                has_kudo: false,
                cursor: null
            }
        },

        /**
         * Finds minimum cursor value among given activity array.
         * @param {*} activities 
         * @returns Minimum cursor value 
         */
        find_min_cursor: function (activities) {

            let min_cursor = this.get_epoch_in_secs()

            for (let i = 0; i < activities.length; i++) {

                const a = activities[i];

                if (a.cursor < min_cursor) {
                    min_cursor = a.cursor
                }

            }

            return min_cursor
        },

        convert_feed_entry_to_activity: function (feed_entry) {

            let activity_array = []

            if (feed_entry.entity == "Activity") {

                let a = this.get_default_activity()
                activity_array.push(a)

                a.id = feed_entry.activity.id;
                a.name = feed_entry.activity.activityName;
                a.athlete = feed_entry.activity.athlete.athleteName;
                a.cursor = feed_entry.cursorData.rank;

                if (feed_entry.activity.kudosAndComments) {

                    if (feed_entry.activity.kudosAndComments.hasKudoed) {
                        a.has_kudo = true
                    }
                    else if (feed_entry.activity.kudosAndComments.canKudo) {
                        a.can_kudo = true
                    }

                }
            }

            else if (feed_entry.entity == "GroupActivity") {

                let cursor = feed_entry.cursorData.rank

                if (feed_entry.rowData) {

                    for (let i = 0; i < feed_entry.rowData.activities.length; i++) {

                        const act = feed_entry.rowData.activities[i];

                        let a = this.get_default_activity()
                        activity_array.push(a);

                        a.id = act.activity_id;
                        a.name = act.name;
                        a.athlete = act.athlete_name;
                        a.cursor = cursor;
                        a.has_kudo = act.has_kudoed;
                        a.can_kudo = act.can_kudo;

                    }
                }
            }

            return activity_array
        },


        /**
         * Converts multiple feed entries to a simpler activity format (see: get_default_activity)
         * @param {*} feed_entries 
         * @returns Array of activities.
         */
        convert_entries: function (feed_entries) {

            let activities = []

            for (let i = 0; i < feed_entries.length; i++) {
                const fe = feed_entries[i];
                activities.push(...this.convert_feed_entry_to_activity(fe))
            }

            return activities
        },

        update_progress_ui: function (text) {
            jQuery("#autokudo_progress_span").text(text)
        }
    }
})();

var strava_api = (function (utils) {

    return {
        /**
         * Give kudo for activity.
         * @param {*} activity 
         */
        kudo_activity: function (activity) {

            var d = jQuery.Deferred();

            var url = `https://www.strava.com/feed/activity/${activity.id}/kudo`;

            jQuery.ajax({
                method: "POST",
                url: url,
                success: function (data) {
                    d.resolve({ activity_id: activity.id, athlete: activity.athlete, name: activity.name });
                },
                error: function (jqXhr, err) {
                    d.reject(err);
                }
            });

            return d.promise();

        },

        /**
         * Gets users feed entries before the given cursor date.
         * @param {*} cursor Epoch in seconds.
         * Strava returns the first 20 records before "cursor" date.
         */
        list_feed: function (cursor) {

            var d = jQuery.Deferred();

            console.log(`Fetching feed entries before (${cursor}) - ${new Date(cursor * 1000)}`)
            var url = `https://www.strava.com/dashboard/feed?feed_type=following&cursor=${cursor}`;
            jQuery.ajax({
                method: "GET",
                url: url,
                success: function (data) {
                    let activities = utils.convert_entries(data.entries)
                    d.resolve(activities);
                },
                error: function (jqXhr, err) {
                    d.reject(err);
                }
            });

            return d.promise();
        }
    };
})(utils);

var app = (function (utils, api) {

    let config = {
        FEED_SEARCH_DEPTH: 3,
        AUTO_KUDO_ENABLED: false,
        AUTO_KUDO_CHECK_SECS: 600,
        HIDE_KUDO_ALL_BUTTON_WHEN_AUTO: false
    }

    let interval = null
    let kudo_in_progress = false

    function get_feed_recursive(cursor, count, data, onFeedFetch) {

        if (data == null) { data = []; }

        if (count == 0) { return data; }

        if (cursor == null) {
            cursor = utils.get_epoch_in_secs()
        }

        return api.list_feed(cursor).then(function (activities) {
            var min_cursor = utils.find_min_cursor(activities);
            data.push(...activities)
            onFeedFetch(activities)
            return get_feed_recursive(min_cursor, count - 1, data, onFeedFetch)
        })
    }

    function get_kudo_eligible_activity_count(activities) {
        let cnt = 0
        for (let i = 0; i < activities.length; i++) {

            const a = activities[i];
            let has_kudo = a.has_kudo;
            let can_kudo = a.can_kudo;

            if (can_kudo && !has_kudo) {
                cnt++
            }
        }

        return cnt
    }

    function delay(time) {
        var d = new jQuery.Deferred();
        setTimeout(function () {
            d.resolve();
        }, time);

        return d.promise();
    }

    function kudo_activities(activities, onKudo) {

        const DELAY_BETWEEN_KUDOS_MS = 300

        var promises = []

        for (let i = 0; i < activities.length; i++) {

            const a = activities[i];

            let activity_id = a.id;
            let athlete = a.athlete;
            let has_kudo = a.has_kudo;
            let can_kudo = a.can_kudo;
            let activity_name = a.name;

            let kudo_status = has_kudo ? String.fromCodePoint(0x1F44D) : " --- "

            //console.log(`Activity (${activity_id}) by ${athlete} - ${activity_name} / Kudo Status: ${kudo_status}`)

            if (can_kudo && !has_kudo) {
                var p = delay(i * DELAY_BETWEEN_KUDOS_MS)
                    .then(function () {
                        return api.kudo_activity(a)
                    }).then(onKudo)
                promises.push(p)
            }
        }

        return Promise.allSettled(promises)
    }

    return {
        search_feed_and_give_kudos: function (feed_depth) {

            var d = jQuery.Deferred()

            kudo_in_progress = true
            utils.update_progress_ui(`Fetching...`)

            if (feed_depth == null) { feed_depth = config.FEED_SEARCH_DEPTH; }
            // go back in feed "feed_depth" times

            var fetch_count = 0
            var onFeedFetch = function (fetched) {
                fetch_count++
                console.log(`Fetched (${fetch_count}/${feed_depth}) ${fetched.length} items.`)
                utils.update_progress_ui(`Fetch (${fetch_count}/${feed_depth})`)
            }

            var kudo_eligible_activity_count = 0
            var kudo_count = 0
            var onKudo = function (response) {
                kudo_count++
                let emj = String.fromCodePoint(0x1F44D)
                console.log(`${emj} kudo given for activity (${response.activity_id}) by ${response.athlete} - ${response.name}`);

                utils.update_progress_ui(`Kudo (${kudo_count}/${kudo_eligible_activity_count})`)
            }

            get_feed_recursive(utils.get_epoch_in_secs(), feed_depth, null, onFeedFetch)
                .then(function (activities) {
                    kudo_eligible_activity_count = get_kudo_eligible_activity_count(activities)

                    console.log(`(${kudo_eligible_activity_count}) out of (${activities.length}) activities are eligible for kudo.`)

                    kudo_activities(activities, onKudo).then(function (res) {
                        console.log(`Kudo activities (${kudo_count}) completed.`)
                        kudo_in_progress = false
                        d.resolve()
                    });
                })

            return d.promise()
        },

        update_configurations: function (new_config) {

            var execution_type_changed = false
            var self = this

            if (config.AUTO_KUDO_ENABLED != new_config.AUTO_KUDO_ENABLED || config.AUTO_KUDO_CHECK_SECS != new_config.AUTO_KUDO_CHECK_SECS) {
                execution_type_changed = true
                if (interval) {
                    console.log("stopping autokudo timer.")
                    ui_timer.stop()
                    utils.update_progress_ui("")
                    clearInterval(interval)
                }
            }

            jQuery.extend(config, new_config)

            if (execution_type_changed && config.AUTO_KUDO_ENABLED) {

                console.log(`starting timer. interval duration = ${config.AUTO_KUDO_CHECK_SECS} seconds.`)

                var total_seconds = config.AUTO_KUDO_CHECK_SECS - 1
                ui_timer.start(1, function () {
                    if (!kudo_in_progress) {
                        var str_time = total_seconds < 3600 ? new Date(total_seconds * 1000).toISOString().substring(14, 19) : new Date(total_seconds * 1000).toISOString().substring(11, 19) 
                        utils.update_progress_ui(str_time)
                    }
                    total_seconds--
                    if (total_seconds == 0) {
                        total_seconds = config.AUTO_KUDO_CHECK_SECS
                    }
                })

                interval = setInterval(function () {
                    self.search_feed_and_give_kudos()
                }, config.AUTO_KUDO_CHECK_SECS * 1000)

            }

            if (config.AUTO_KUDO_ENABLED && config.HIDE_KUDO_ALL_BUTTON_WHEN_AUTO) {
                jQuery("#autokudo_item").hide()
            }
            else {
                jQuery("#autokudo_item").show()
            }

            console.log(config)
        },

        get_configurations: function () {
            return config
        }

    }
})(utils, strava_api)

window.addEventListener('load', (event) => {
    console.log('page loaded.');

    let btnKudo = jQuery(`<li id="autokudo_item" class="nav-item">
    <span id="autokudo_button" class="experiment btn btn-sm btn-primary">Kudo All!</span>
    </li>`)

    let progress = jQuery(`<li id="autokudo_progress_item" class="nav-item">
    <span id="autokudo_progress_span" ></span>
    </li>`)

    let btnUpdateSettings = jQuery(`<button id="autokudo_settings"></button>`)

    btnUpdateSettings.click(function (e) {
        var new_config = e.detail
        app.update_configurations(new_config)
    })

    btnKudo.click(function () {
        app.search_feed_and_give_kudos().then(function(){
            utils.update_progress_ui("")
        })
    })

    jQuery(".global-nav").append(btnKudo)
    jQuery(".global-nav").append(progress)
    jQuery(".global-nav").append(btnUpdateSettings)

});