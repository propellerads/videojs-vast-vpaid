(function(window){
  "use strict";

  /**
   *
   * @param options
   * @param {string} options.url url for getting configuration for player
   * @param {string} [options.containerId = 'video_element'] id of video element to load ad
   * @param {boolean} [options.adsEnabled = true] should we play ad or not
   * @param {boolean} [options.withCredentials = true] should we send withCredentials as true or false
   * @param {string} [options.pixel] url of pixel
   */
  window.videoInitWrapper = function(options){

    var ajax, pixel;

    if(options.url === void 0) {
      throw new Error("Required option 'url' is not defined");
    }
    options.containerId = options.containerId || "video_element";
    options.adsEnabled = options.adsEnabled !== void 0 ? options.adsEnabled : true;
    options.withCredentials = options.withCredentials !== void 0 ? options.withCredentials : true;

    ajax = new XMLHttpRequest();

    ajax.withCredentials = options.withCredentials;

    ajax.onreadystatechange = function() {
      if (ajax.readyState == XMLHttpRequest.DONE) {
        if (ajax.status == 200) {
          _init(JSON.parse(ajax.responseText));
        } else {
          throw new Error('Config request failed with status: ' + ajax.status);
        }
      }
    };
    ajax.open("GET", options.url, true);
    ajax.send();

    if(options.pixel !== void 0){
      pixel = new XMLHttpRequest();
      pixel.open("GET", options.pixel, true);
      pixel.send();
    }

    function _init(config){
      config = _reconfigure(config);
      var preRoll = config.vast_preroll.slice(0);
      var postRoll = config.vast_postroll.slice(0);

      videojs(options.containerId, {}, function(){
        // 'this' context in current scope is equal to player
        this.vastClient({
          "adsEnabled" : options.adsEnabled,
          "adCancelTimeout" : options.adCancelTimeout || 3000,
          "urls" : preRoll,
          "postRoll" : postRoll,
          "withCredentials" : options.withCredentials,
          "vpaidFlashLoaderPath" : options.vpaidFlashLoaderPath
        });

        if (this.autoplay()) {
          this.play();
        }

      });
    }

    function _reconfigure(config){

      if( config.vast_preroll !== void 0){
        config.vast_preroll = config.vast_preroll.split(' or ').map(function(url){return url.trim()});
      }

      if( config.vast_postroll !== void 0){
        config.vast_postroll = config.vast_postroll.split(' or ').map(function(url){return url.trim()});
      }

      return config;
    }

  };


})(window);