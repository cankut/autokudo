var s = document.createElement('script');
s.src = chrome.runtime.getURL('scripts/autokudo.js');
(document.head || document.documentElement).appendChild(s);
console.log("injected autokudo script...");

var default_config = {
    FEED_SEARCH_DEPTH: 3,
    AUTO_KUDO_ENABLED: false,
    AUTO_KUDO_CHECK_SECS: 600,
    HIDE_KUDO_ALL_BUTTON_WHEN_AUTO: false
}

function applyConfiguration(config) {
    console.log("applying autokudo settings...")
    var btn = document.getElementById("autokudo_settings")
    btn.dispatchEvent(new CustomEvent("click", { "detail": config }));
}

chrome.runtime.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (request.command === "update") {
            applyConfiguration(request.config)
        }
        sendResponse()
    }
);

window.addEventListener('load', (event) => {
    chrome.storage.sync.get("config", function (obj) {
        if (!chrome.runtime.error) {

            if (!obj.config) {
                console.log("config is empty. applying default config.")
                chrome.storage.sync.set({ "config": default_config }, function () { });
                applyConfiguration(default_config)
            }
            else {
                console.log("loaded config from store.")
                applyConfiguration(obj.config)
            }
        }
    })
})
