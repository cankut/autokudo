var default_config = {
    FEED_SEARCH_DEPTH: 3,
    AUTO_KUDO_ENABLED: false,
    AUTO_KUDO_CHECK_SECS: 600,
    HIDE_KUDO_ALL_BUTTON_WHEN_AUTO: false
}

document.getElementById("save").addEventListener("click", save_config);
document.getElementById("exec_auto").addEventListener("change", on_exec_type_change);
document.getElementById("exec_manual").addEventListener("change", on_exec_type_change);

chrome.storage.sync.get("config", function (obj) {
    if (!chrome.runtime.error) {
        if (!obj.config) {
            console.log("config is empty. applying default config.")
            chrome.storage.sync.set({ "config": default_config }, function () { });
            setUI(default_config)
        }
        else {
            console.log("config ok.")
            console.log(obj.config)
            setUI(obj.config)
        }
    }
})

function on_exec_type_change(event) {

    console.log("exec type changed:" + Date.now())
    let id = event.currentTarget.id;

    if (id === "exec_auto") {
        document.getElementById("config_auto").classList.remove("hidden")
    } else if (id === "exec_manual") {
        document.getElementById("config_auto").classList.add("hidden")
    }

}

function setUI(config) {
    document.getElementById("FEED_SEARCH_DEPTH").value = config.FEED_SEARCH_DEPTH
    document.getElementById("AUTO_KUDO_CHECK_SECS").value = config.AUTO_KUDO_CHECK_SECS
    document.getElementById("HIDE_KUDO_ALL_BUTTON_WHEN_AUTO").checked = config.HIDE_KUDO_ALL_BUTTON_WHEN_AUTO

    if (config.AUTO_KUDO_ENABLED) {
        document.getElementById("exec_auto").checked = true
        document.getElementById("exec_auto").dispatchEvent(new Event("change", { bubbles: true, cancelable: true, }))
    }
    else {
        document.getElementById("exec_manual").checked = true
        document.getElementById("exec_manual").dispatchEvent(new Event("change", { bubbles: true, cancelable: true, }))
    }
}

function readFromUIWithLimitRules(elementId, min, max) {
    var val = parseInt(document.getElementById(elementId).value)
    if (val === NaN || val == null) {
        return min
    }

    if (val < min) { return min }
    if (val > max) { return max }
    return val
}

function getConfigFromUI() {

    var FEED_SEARCH_DEPTH = readFromUIWithLimitRules("FEED_SEARCH_DEPTH", 1, 15)
    var AUTO_KUDO_CHECK_SECS = readFromUIWithLimitRules("AUTO_KUDO_CHECK_SECS", 60, 3600)
    var HIDE_KUDO_ALL_BUTTON_WHEN_AUTO = document.getElementById("HIDE_KUDO_ALL_BUTTON_WHEN_AUTO").checked
    var AUTO_KUDO_ENABLED = document.getElementById("exec_auto").checked

    return {
        FEED_SEARCH_DEPTH: FEED_SEARCH_DEPTH,
        AUTO_KUDO_ENABLED: AUTO_KUDO_ENABLED,
        AUTO_KUDO_CHECK_SECS: AUTO_KUDO_CHECK_SECS,
        HIDE_KUDO_ALL_BUTTON_WHEN_AUTO: HIDE_KUDO_ALL_BUTTON_WHEN_AUTO
    };
}

function sendConfigUpdateMessage(config, onSaveHandler) {
    //send update message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {

        chrome.tabs.sendMessage(tabs[0].id,
            {
                command: "update",
                config: config
            },
            function (response) { onSaveHandler() })
    })
}

function save_config() {

    //read config from UI
    var cfg = getConfigFromUI()

    chrome.storage.sync.set({ "config": cfg }, function () {
        // Update status to let user know options were saved.
    })

    sendConfigUpdateMessage(cfg, function () { window.close() })

}



