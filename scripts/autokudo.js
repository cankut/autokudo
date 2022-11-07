
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

            var url = `https://www.strava.com/feed/activity/${activity.id}/kudo`;

            jQuery.ajax({
                method: "POST",
                url: url,
                success: function (data) {
                    let emj = String.fromCodePoint(0x1F44D)
                    console.log(`${emj} kudo given for activity (${activity.id}) by ${activity.athlete} - ${activity.name}`);
                }
            });

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
                    console.log("Fetch executed.");
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

    function get_feed_recursive(cursor, count, data) {

        if (data == null) { data = []; }

        if (count == 0) { return data; }

        if (cursor == null) {
            cursor = utils.get_epoch_in_secs()
        }

        return api.list_feed(cursor).then(function (activities) {
            var min_cursor = utils.find_min_cursor(activities);
            data.push(...activities)
            return get_feed_recursive(min_cursor, count - 1, data)
        })
    }

    function kudo_activities(activities) {

        const DELAY_BETWEEN_KUDOS_MS = 300
        let already_kudo = 0
        let to_give_kudo = 0

        for (let i = 0; i < activities.length; i++) {

            const a = activities[i];

            let activity_id = a.id;
            let athlete = a.athlete;
            let has_kudo = a.has_kudo;
            let can_kudo = a.can_kudo;
            let activity_name = a.name;

            if (has_kudo) {
                already_kudo++
            }
            else if (can_kudo) {
                to_give_kudo++
            }


            let kudo_status = has_kudo ? String.fromCodePoint(0x1F44D) : " --- "
            console.log(`Activity (${activity_id}) by ${athlete} - ${activity_name} / Kudo Status: ${kudo_status}`)
            if (can_kudo && !has_kudo) {
                setTimeout(function () { api.kudo_activity(a) }, i * DELAY_BETWEEN_KUDOS_MS)
            }

        }

        console.log(`Total Activity Count: ${activities.length}`)
        console.log(`Already Given Kudo Count: ${already_kudo}`)
        console.log(`To Be Given Kudo Count: ${to_give_kudo}`)
        console.log("")
    }

    return {
        search_feed_and_give_kudos: function (feed_depth) {

            if (feed_depth == null) { feed_depth = config.FEED_SEARCH_DEPTH; }
            // go back in feed "feed_depth" times

            get_feed_recursive(utils.get_epoch_in_secs(), feed_depth)
                .then(function (activities) {
                    kudo_activities(activities);
                })

            return
        },

        update_configurations: function (new_config) {

            var execution_type_changed = false
            var self = this

            if (config.AUTO_KUDO_ENABLED != new_config.AUTO_KUDO_ENABLED || config.AUTO_KUDO_CHECK_SECS != new_config.AUTO_KUDO_CHECK_SECS) {
                execution_type_changed = true
                if (interval) {
                    console.log("stopping autokudo timer.")
                    clearInterval(interval)
                }
            }

            jQuery.extend(config, new_config)

            if (execution_type_changed && config.AUTO_KUDO_ENABLED) {
                console.log(`starting timer. interval duration = ${config.AUTO_KUDO_CHECK_SECS} seconds.`)
                interval = setInterval(function () {
                    self.search_feed_and_give_kudos()
                }, config.AUTO_KUDO_CHECK_SECS * 1000)
            }

            if (config.AUTO_KUDO_ENABLED && config.HIDE_KUDO_ALL_BUTTON_WHEN_AUTO) {
                jQuery(".autokudo").hide()
            }
            else {
                jQuery(".autokudo").show()
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

    let btnKudo = jQuery(`<li class="nav-item autokudo" style="padding-left: 10px;"><span class="experiment btn btn-sm btn-primary">Kudo All!</span></li>`)
    let btnUpdateSettings = jQuery(`<button id="autokudo_settings" style="display: none;"></button>`)

    btnUpdateSettings.click(function (e) {
        var new_config = e.detail
        app.update_configurations(new_config)
    })

    btnKudo.click(function () {
        app.search_feed_and_give_kudos()
    })

    jQuery(".global-nav").append(btnKudo)
    jQuery(".global-nav").append(btnUpdateSettings)

});