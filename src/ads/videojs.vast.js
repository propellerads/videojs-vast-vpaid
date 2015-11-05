vjs.plugin('vastClient', function VASTPlugin(options) {
  var snapshot;
  var player = this;
  var urlIndex = 0;
  var adsCanceled = false;
  var _postRoll = false;
  var defaultOpts = {
    // maximum amount of time in ms to wait to receive `adsready` from the ad
    // implementation after play has been requested. Ad implementations are
    // expected to load any dynamic libraries and make any requests to determine
    // ad policies for a video during this time.
    timeout: 500,

    //TODO:finish this IOS FIX
    //Whenever you play an add on IOS, the native player kicks in and we loose control of it. On very heavy pages the 'play' event
    // May occur after the video content has already started. This is wrong if you want to play a preroll ad that needs to happen before the user
    // starts watching the content. To prevent this usec
    iosPrerollCancelTimeout: 2000,

    // maximun amount of time for the ad to actually start playing. If this timeout gets
    // triggered the ads will be cancelled
    adCancelTimeout: 1000,

    // Boolean flag that configures the player to play a new ad before the user sees the video again
    // the current video
    playAdAlways: false,

    // Flag to enable or disable the ads by default.
    adsEnabled: true,

    // Boolean flag to enable or disable the resize with window.resize or orientationchange
    autoResize: true,

    // Path to the VPAID flash ad's loader
    vpaidFlashLoaderPath: '/VPAIDFlash.swf',

    withCredentials : true
  };

  function incUrlIndex(){
    urlIndex = urlIndex + 1;
  }

  var adCancelTimeoutId = null;
  function _clearAdsCancelTimeout(){
    if(adCancelTimeoutId !== null){
      clearTimeout(adCancelTimeoutId);
      adCancelTimeoutId = null;
    }
  }
  player.on('vast.adStart', _clearAdsCancelTimeout);

  var settings = extend({}, defaultOpts, options || {});

  var vast = new VASTClient({
    withCredentials : settings.withCredentials
  });

  if (isDefined(settings.urls)) {
    settings.url = echoFn(settings.urls[urlIndex]);
    incUrlIndex();

    player.on('adSkip', clearWaterfall);
    player.on('vast.adError', playNext);
    player.on('vast.adEnd', clearWaterfall);

  }

  if (isDefined(settings.postRoll) && settings.postRoll.length) {
    player.on('vast.postRoll', function(){
      _postRoll = true;
    });
    player.one('vast.contentEnd', function(){
      player.one('vast.adStart', function(){
        if(snapshot !== null && isDefined(snapshot)){
          snapshot.autoplay = false;
        }
        player.trigger('vast.postRoll');
      });
      console.log()
      settings.urls = settings.postRoll;
      urlIndex = 1;
      setTimeout(tryToPlayAd,0);
    });
  }

  if (isString(settings.url)) {
    settings.url = echoFn(settings.url);
  }

  if (!isDefined(settings.url) && !isDefined(settings.urls)) {
    return trackAdError(new VASTError('on VideoJS VAST plugin, missing url on options object'));
  }

  playerUtils.prepareForAds(player);

  //
  //if (settings.playAdAlways) {
  //  // No matter what happens we play a new ad before the user sees the video again.
  //  player.on('vast.contentEnd', function () {
  //    setTimeout(function () {
  //      player.trigger('vast.reset');
  //    }, 0);
  //  });
  //}

  player.on('vast.firstPlay', tryToPlayAd);

  //If there is an error on the player, we reset the plugin.
  player.on('error', function() {
    player.trigger('vast.reset');
  });

  player.on('vast.reset', function () {
    //If we are reseting the plugin, we don't want to restore the content
    snapshot = null;
    cancelAds();
  });

  player.on('adNext', function () {
    cancelAds();
    setTimeout(function(){
      if(isDefined(settings.urls[urlIndex])){
        player.play();
      }
    }, 0);
  });

  player.vast = {
    isEnabled: function () {
      return settings.adsEnabled;
    },

    enable: function () {
      settings.adsEnabled = true;
    },

    disable: function () {
      settings.adsEnabled = false;
    }
  };

  return player.vast;

  function tryToPlayAd() {

    //We remove the poster to prevent flickering whenever the content starts playing
    playerUtils.removeNativePoster(player);

    playerUtils.once(player, ['vast.adsCancel', 'vast.adEnd'], function (e) {
      removeAdUnit();
      if(isUndefined(settings.urls) || isUndefined(settings.urls[urlIndex])) {
        restoreVideoContent();
      }
    });

    async.waterfall([
      preparePlayerForAd,
      checkAdsEnabled,
      playPrerollAd
    ], function (error, response) {
      if (error) {
        trackAdError(error, response);
      } else {
        player.trigger('vast.adEnd');
      }
    });

    /*** Local functions ***/

    function removeAdUnit() {
      if (player.vast && player.vast.adUnit) {
        player.vast.adUnit = null; //We remove the adUnit
      }
    }

    function restoreVideoContent() {
      setupContentEvents();
      if (snapshot) {
        playerUtils.restorePlayerSnapshot(player, snapshot);
        snapshot = null;
      }
    }


    function setupContentEvents() {
      playerUtils.once(player, ['playing', 'vast.reset'], function (evt) {
        if (evt.type !== 'playing') {
          return;
        }

        player.trigger('vast.contentStart');

        playerUtils.once(player, ['ended', 'vast.reset'], function (evt) {
          if (evt.type === 'ended') {
            player.trigger('vast.contentEnd');
          }
        });
      });
    }

    function checkAdsEnabled(next) {
      if (settings.adsEnabled) {
        return next(null);
      }
      next(new VASTError('Ads are not enabled'));
    }

    function preparePlayerForAd(next) {
      if (canPlayPrerollAd()) {
        snapshot = playerUtils.getPlayerSnapshot(player);
        player.pause();
        addSpinnerIcon();
        startAdCancelTimeout();
        next(null);
      } else {
        next(new VASTError('video content has been playing before preroll ad'));
      }
    }

    function canPlayPrerollAd() {
      return !isIPhone() || player.currentTime() <= settings.iosPrerollCancelTimeout;
    }


    function startAdCancelTimeout() {
      adsCanceled = false;
      _clearAdsCancelTimeout();
      adCancelTimeoutId = setTimeout(playNext, settings.adCancelTimeout);
    }

    function addSpinnerIcon() {
      dom.addClass(player.el(), 'vjs-vast-ad-loading');
      playerUtils.once(player, ['vast.adStart', 'vast.adsCancel'], removeSpinnerIcon);
    }

    function removeSpinnerIcon() {
      //IMPORTANT NOTE: We remove the spinnerIcon asynchronously to give time to the browser to start the video.
      // If we remove it synchronously we see a flash of the content video before the ad starts playing.
      setTimeout(function () {
        dom.removeClass(player.el(), 'vjs-vast-ad-loading');
      }, 100);
    }

  }

  function cancelAds() {
    player.trigger('vast.adsCancel');
    adsCanceled = true;
  }

  function playPrerollAd(callback) {
    async.waterfall([
      getVastResponse,
      playAd
    ], callback);
  }

  function playNext(evt){
    _clearAdsCancelTimeout();
    if(isDefined(settings.urls[urlIndex])){
      settings.url = echoFn(settings.urls[urlIndex]);
      incUrlIndex();
      player.trigger('adNext');
    }
  }

  function clearWaterfall(){
    settings.urls = [];
  }

  function getVastResponse(callback) {
    vast.getVASTResponse(settings.url(), callback);
  }

  function playAd(vastResponse, callback) {
    //TODO: Find a better way to stop the play. The 'playPrerollWaterfall' ends in an inconsistent situation
    //If the state is not 'preroll?' it means the ads were canceled therefore, we break the waterfall
    if (adsCanceled) {
      return;
    }
    var adIntegrator;

    _clearAdsCancelTimeout();
    if(isVPAID(vastResponse)){
      adIntegrator = new VPAIDIntegrator(player, settings);
    } else {
      adIntegrator = new VASTIntegrator(player);
    }
    var adFinished = false;

    playerUtils.once(player, ['vast.adStart', 'vast.adsCancel'], function (evt) {
      if (evt.type === 'vast.adStart') {
        addAdsLabel();
      }
    });

    playerUtils.once(player, ['vast.adEnd', 'vast.adsCancel'], removeAdsLabel);

    if (isIDevice()) {
      preventManualProgress();
    }

    player.vast.adUnit = adIntegrator.playAd(vastResponse, callback);

    /*** Local functions ****/
    function addAdsLabel() {
      if (adFinished || player.controlBar.getChild('AdsLabel')) {
        return;
      }
      player.controlBar.addChild('AdsLabel');
    }

    function removeAdsLabel() {
      player.controlBar.removeChild('AdsLabel');
      adFinished = true;
    }

    function preventManualProgress() {
      var PROGRESS_THRESHOLD = 1;
      var previousTime = 0;
      var tech = player.el().querySelector('.vjs-tech');
      var skipad_attempts = 0;

      player.on('timeupdate', adTimeupdateHandler);
      playerUtils.once(player, ['vast.adEnd', 'vast.adsCancel', 'vast.adError'], stopPreventManualProgress);

      /*** Local functions ***/
      function adTimeupdateHandler() {
        var currentTime = player.currentTime();
        var progressDelta = Math.abs(currentTime - previousTime);

        if (progressDelta > PROGRESS_THRESHOLD) {
          skipad_attempts += 1;
          if (skipad_attempts >= 2) {
            player.pause();
          }
          player.currentTime(previousTime);
        } else {
          previousTime = currentTime;
        }
      }

      function stopPreventManualProgress() {
        player.off('timeupdate', adTimeupdateHandler);
      }
    }
  }

  function trackAdError(error, vastResponse) {
    player.trigger({type: 'vast.adError', error: error});
    cancelAds();
    if (console && console.log) {
      console.log('Ad Error:', {
        message : error.message,
        error : error,
        response : vastResponse,
        url : settings.url
      });
    }
  }

  function isVPAID(vastResponse) {
    var i, len;
    var mediaFiles = vastResponse.mediaFiles;
    for (i = 0, len = mediaFiles.length; i < len; i++) {
      if (vastUtil.isVPAID(mediaFiles[i])) {
        return true;
      }
    }
    return false;
  }
});
