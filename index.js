module.exports = SteamOffer;

var request = require('request');
var cheerio = require('cheerio');

require('util').inherits(SteamOffer, require('events').EventEmitter);

function SteamOffer() {
  require('events').EventEmitter.call(this);
  
  this._j = request.jar();
  this._request = request.defaults({jar:this._j});
}

SteamOffer.prototype._loadForeignInventory = function(appid, contextid) {
  var self = this;
  
  this._request.post({
    uri: 'http://steamcommunity.com/tradeoffer/new/partnerinventory/',
    headers: {
      referer: 'http://steamcommunity.com/tradeoffer/new/?partner=' + this.tradePartnerMiniID
    },
    form: {
      appid: appid,
      contextid: contextid,
      partner: this.tradePartnerSteamID,
      sessionid: this.sessionID
    },
    json: true
  }, function(error, response, body) {
    if (error) {
      self.emit('debug', 'loading inventory: ' + error);
      // retry
      self._loadForeignInventory(appid, contextid);
      return;
    }
    
    for (var id in body.rgInventory) {
      var item = body.rgInventory[id];
      var description = body.rgDescriptions[item.classid + '_' + item.instanceid];
      for (var key in description) {
        item[key] = description[key];
      }
    }
    
    if (!self._themInventories[appid]) {
      self._themInventories[appid] = {};
    }
    self._themInventories[appid][contextid] = body.rgInventory;
    
    self._loadingInventoryData = false;
  });
};

SteamOffer.prototype.setCookie = function(cookie) {
  this._j.add(request.cookie(cookie));
};

SteamOffer.prototype.open = function(steamID, miniID, callback) {
  this.tradePartnerSteamID = steamID;
  this.tradePartnerMiniID = miniID;
  this.themAssets = [];
  this._themInventories = {};
  this._meAssets = [];
  this._nextLogPos = 0;
  this._version = 1;
  
  this._send('tradestatus', {
    logpos: this._nextLogPos,
    version: this._version
  }, callback);
};

SteamOffer.prototype.loadInventory = function(appid, contextid, callback) {
  this._request.get({
    uri: 'http://steamcommunity.com/my/inventory/json/' + appid + '/' + contextid + '?trading=1',
    json: true
  }, function(error, response, body) {
    if (error || response.statusCode != 200) {
      this.emit('debug', 'loading my inventory: ' + (error || response.statusCode));
      this.loadInventory(appid, contextid, callback);
      return;
    }
    if (typeof body != 'object') {
      // no session
      callback();
      return;
    }
    callback(mergeWithDescriptions(body.rgInventory, body.rgDescriptions, contextid)
      .concat(mergeWithDescriptions(body.rgCurrency, body.rgDescriptions, contextid)));
  }.bind(this));
};

function mergeWithDescriptions(items, descriptions, contextid) {
  return Object.keys(items).map(function(id) {
    var item = items[id];
    var description = descriptions[item.classid + '_' + (item.instanceid || '0')];
    for (var key in description) {
      item[key] = description[key];
    }
    // add contextid because Steam is retarded
    item.contextid = contextid;
    return item;
  });
}

SteamOffer.prototype.miniprofile = function(steamid, callback) {
  var self = this;

  this._request.get({
    uri: 'http://steamcommunity.com/profiles/' + steamid + '/inventory/'
  }, function(error, response, body) {
    if (error) {
      self.emit('debug', 'getting miniprofile: ' + error);
      return;
    }
    
    var $ = cheerio.load(body)
    var onclick = $('a.inventory_newtradeoffer').attr('onclick');
    onclick = onclick.match(/\(.+?\)/g).toString();
    onclick = onclick.replace('(','');
    onclick = onclick.replace(')','');
    onclick = onclick.trim();
    callback(onclick);
  });
};
