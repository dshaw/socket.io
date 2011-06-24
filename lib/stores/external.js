/*!
 * Socket.IO External Store
 * Copyright(c) 2011 Daniel D. Shaw <dshaw@dshaw.com>
 * MIT Licenced
 */

/**
 * Module Dependencies
 */

var crypto = require('crypto')
  , util = require('util')
  , sio = require('socket.io')
  , Store = sio.Store
  , EventEmitter2 = require('eventemitter2');

/**
 * Export the constructors
 */

exports = module.exports = ExternalStore;
ExternalStore.Client = Client;

/**
 * External Store
 *
 * @param {Object} options
 * @api public
 */

function ExternalStore(opts) {
  console.log('initializing external store with', opts || 'default options');

  opts || (opts = {});

  this.handshaken = new Handshaken();
  // TODO: don't store the data in the storage object
  this.clientsMap = {};
  this.rooms = {};
  this.opts = opts;

  // dispatch events
  // ---
}

/**
 * Monkey patch Socket.IO Store to use EventEmitter2 instead of events.EventEmitter
 */

Store.prototype.__proto__ = EventEmitter2.prototype;

/**
 * Inherits from Socket.IO Store
 */

util.inherits(ExternalStore, Store);


/**
 * Handshake a client.
 *
 * @param {Object} client request object
 * @param {Function} callback
 * @api public
 */

ExternalStore.prototype.handshake = function (data, fn) {
  var id = this.generateId();
  this.handshaken.add(id, function(err, res) {
    fn && fn(null, id);
  });
  return this;
};

/**
 * Checks if a client is handshaken.
 *
 * @api public
 */

ExternalStore.prototype.isHandshaken = function (id, fn) {
  this.handshaken.exists(id, function(err, res) {
    fn(null, !!res);
  });
  return this;
};

/**
 * Generates a random id.
 *
 * @api private
 */

ExternalStore.prototype.generateId = function () {
  var rand = String(Math.random() * Math.random() * Date.now());
  return crypto.createHash('md5').update(rand).digest('hex');
};

/**
 * Retrieves a client store instance.
 *
 * TODO: Async or promise or is the core object dumb enough to "store" encapsulate
 * everything it needs to in the method calls
 *
 * @api public
 */

ExternalStore.prototype.client = function (id /*, fn */) {
  if (!this.clientsMap[id]) {
    this.clientsMap[id] = new ExternalStore.Client(this, id);
    this.log.debug('initializing client store for', id);
  }

  return this.clientsMap[id];
};

/**
 * Called when a client disconnects.
 *
 * @param {String} id
 * @param {Boolean} force
 * @param {String} reason
 *
 * @api public
 */

ExternalStore.prototype.disconnect = function (id, force, reason) {
  var self = this;
  this.handshaken.exists(id, function(err, exists) {
    if (exists) {
      self.log.debug('destroying dispatcher for', id);

      self.handshaken.remove(id, function(err) {
        self.clientsMap[id].destroy();
        self.clientsMap[id] = null;
      });

      if (force)
        self.publish('disconnect-force:' + id, reason);

      self.publish('disconnect:' + id, reason);
    }
  });

  return this;
};

/**
 * Relays a heartbeat message.
 *
 * @param {String} id
 *
 * @api private
 */

ExternalStore.prototype.heartbeat = function (id) {
  return this.publish('heartbeat-clear:' + id);
};

/**
 * Relays a packet
 *
 * @param {String} id
 * @param {Object} packet
 *
 * @api private
 */

ExternalStore.prototype.message = function (id, packet) {
  return this.publish('message:' + id, packet);
};

/**
 * Returns client ids in a particular room
 *
 * @param {String} room
 * @param {Function} callback
 *
 * @api public
 */

ExternalStore.prototype.clients = function (room, fn) {};

/**
 * Joins a user to a room
 *
 * @param {String} sid
 * @param {String} room
 * @param {Function} callback
 *
 * @api private
 */

ExternalStore.prototype.join = function (sid, room, fn) {};

/**
 * Removes a user from a room
 *
 * @api private
 */

ExternalStore.prototype.leave = function (sid, room, fn) {};

/**
 * Emit wrapper for ExternalStore
 *
 * @param event
 * @param data
 */

ExternalStore.prototype.emit_ = function(event, data) {};


/**
 * Simple publish
 *
 * @param {String} event
 * @param {Object} data
 * @param {Function} callback
 *
 * @api public
 */

ExternalStore.prototype.publish = function (ev, data, fn) {
  return this;
};

/**
 * Simple subscribe
 *
 * @param {String} channel
 * @param {Function} callback
 *
 * @api public
 */

ExternalStore.prototype.subscribe = function (chn, fn) {
  return this;
};

/**
 * Simple unsubscribe
 *
 * @param {String} channel
 *
 * @api public
 */

RedisStore.prototype.unsubscribe = function (chn) {};

/**
 * Client constructor
 *
 * @api private
 */

function Client (store, id) {
  Store.Client.apply(this, arguments);
  this.reqs = 0;
  this.paused = true;
  this.rooms = {};
}

/**
 * Inherits from Store.Client
 */

util.inherits(Client, Store.Client);

/**
 * Counts transport requests.
 *
 * @param {Function} callback
 *
 * @api public
 */

Client.prototype.count = function (fn) {
  var key = this.store.key('client', this.id);
  this.store.redisClient.hincrby(key, 'count', 1, function(err, res) {
    fn(null, res);
  });
  return this;
};

/**
 * Sets up queue consumption
 *
 * @param {Function} callback
 *
 * @api public
 */

Client.prototype.consume = function (fn) {
  this.consumer = fn;
  this.paused = false;

  if (this.buffer.length) {
    fn(this.buffer, null);
    this.buffer = [];
  }

  return this;
};

/**
 * Publishes a message to be sent to the client.
 *
 * @String encoded message
 * @api public
 */

Client.prototype.publish = function (msg) {
  console.log('Client publish', msg);
  if (this.paused) {
    this.buffer.push(msg);
  } else {
    this.consumer(null, msg);
    console.log('passed to consumer', this.consumer);
  }

  return this;
};

/**
 * Pauses the stream.
 *
 * @api public
 */

Client.prototype.pause = function () {
  this.paused = true;
  return this;
};

/**
 * Destroys the client.
 *
 * @api public
 */

Client.prototype.destroy = function () {
  this.buffer = null;
};

/**
 * Gets a key
 *
 * @param {String} key
 * @param {Function} callback
 *
 * @api public
 */

Client.prototype.get = function (key, fn) {
  return this;
};

/**
 * Sets a key
 *
 * @param {String} key
 * @param {String} value
 * @param {Function} callback
 *
 * @api public
 */

Client.prototype.set = function (key, value, fn) {
  return this;
};

/**
 * Emits a message incoming from client.
 *
 * TODO: this should probably publish to redis instead of emitting
 *
 * @param {String} message
 *
 * @api private
 */

Client.prototype.onMessage = function (msg) {
  this.store.publish('message:' + this.id, msg);
};


/**
 * Handshaken
 *
 * Simple prototype for handshake registery
 *
 *
 */

function Handshaken () {
  this.registry = [];
}

/**
 * Add to handshaken
 *
 * @param id
 * @param callback
 * @api private
 */

Handshaken.prototype.add = function (id, fn) {
  this.registry.push(id);
  fn(null, id);
  return this;
};

/**
 * Remove from handshaken
 *
 * @param id
 * @param callback
 * @api private
 */

Handshaken.prototype.remove = function (id, fn) {
  this.registry.splice(this.registry.indexOf(id), 1);
  fn && fn(null);
  return this;
};

/**
 * Exists in handshaken
 *
 * @param id
 * @param callback
 * @api private
 */

Handshaken.prototype.exists = function (id, fn) {
  fn(null, ~this.registry.indexOf(id));
  return this;
};
