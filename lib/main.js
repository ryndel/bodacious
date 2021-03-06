"use strict";

var _ = require('underscore');
var async = require('async');
var defaults = require('../config/default');
var events = require('events');
var util = require('util');
// lib classes
var Job = require('./job');
var Queue = require('./queue');
var Store = require('./store');


var MINIMUM_REDIS_VERSION = defaults.redis.version;
var LOCK_RENEW_TIME = defaults.options.lock; // 5 seconds is the renew time.
var CLIENT_CLOSE_TIMEOUT_MS = defaults.options.timeout;

var Main = function Main(name, options){

	options = options || {};
	options.redis = options.redis || {};
	options.filesystem = options.filesystem || {};
	options.redis = _.extend({}, defaults.redis, options.redis );
	options.filesystem = _.extend({}, defaults.filesystem, options.filesystem );
	options = _.extend({}, defaults.options, options); // deep extend instead?
	options.queue = name;
	// save options
	this.options = options;

	var redisDB = options.db || 0;

	this.name = name;

	//
	// Create queue client (used to add jobs, pause queues, etc);
	//
	this.store = new Store( options );
	this.queue = new Queue( this.store, options );
	// support multiple queues?
	this.queue.name = this.name;

	// bindings
	_.bindAll(this, 'run');


	this.delayedTimestamp = Number.MAX_VALUE;
	this.delayTimer;

	this.LOCK_RENEW_TIME = LOCK_RENEW_TIME;

	//events.EventEmitter.call(this);

	// bubble up queue events
	this.queue.on('active', this.emit.bind(this, 'active'));
	this.queue.on('completed', this.emit.bind(this, 'completed'));
	this.queue.on('failed', this.emit.bind(this, 'failed'));
	this.queue.on('error', this.emit.bind(this, 'error'));
	// run on add
	if( this.options.autorun ){
		this.queue.on('add', this.run);
	}

}

// Events
util.inherits(Main, events.EventEmitter);


// API


Main.prototype.close = function(){

};

// Processes a job from the queue. The callback is called for every job that is dequeued.
Main.prototype.process = function(concurrency, handler){
	// concurrency: execute queue in parallel (optional)
	// handler: aka callback, how to handle each job

	if (typeof concurrency == "function") {
		handler = concurrency;
		concurrency = 1;
	}
	// set concurrency=1 when this.options.serial=true?

	if(this.handler) {
		throw Error("Cannot define a handler more than once per instance"); /// why not replace?
	}
	// save for later
	this.concurrency = concurrency;
	this.queue.handler = handler;

	// auto-start (if enabled)
	if( this.options.autorun ){
		this.run();
	}
};

// Adds a job to the queue
Main.prototype.add = function(data, options){
	// merge options
	options = options || {};
	options = _.extend({}, this.options, options );
	// create a new job
	var job = new Job({ data: data, options: options });
	// add it to the queue
	this.queue.add( job );
};

// Returns the number of jobs waiting to be processed
Main.prototype.count = function(){

};

// Empties the queue
Main.prototype.empty = function(){

};

// Pauses the processing of this queue
Main.prototype.pause = function(){
	this.queue.pause();
	// trigger event
	this.emit('pause');
};

Main.prototype.resume = function(){
	this.queue.resume();
	// trigger event
	this.emit('resume');
};

// execute queue
Main.prototype.run = function(){
	var self = this;

	// stop if already running...
	if( this.queue.processing || this.queue.paused ) return;

	// load data in batches
	var jobs = [];
	var i = this.concurrency;

	//while(i--) {
		//jobs.push(

		//);
	//}

	var actions = [
		// load jobs
		function( done ){
			self.queue.load(function( results ){
				// error control?
				jobs = results;
				// continue...
				done();
			});
		},

		// check if queue is empty
		function( done ){
			if( _.isEmpty(jobs) ) return done('empty');
			// continue...
			done();
		},

		// execute jobs
		function( done ){
			// serial as option?
			//return (self.options.serial) ? async.series( jobs ) : async.parallel( jobs );
			var method = (self.options.serial) ? "eachSeries" : "each";
			//
			async[method](jobs, function( job, next ){
				// exit now if the queue paused
				if( self.queue.paused ) return next('paused');
				// process queue for each item
				self.queue.process( job, function(err, result){
					// error control?
					next();
				});
			}, function(err, results){
				//error control
				if( err ){
					switch( err ){
						case "paused":
							// no error... silent stop
						break;
						default:
						return self.emit('error', { message: err }); //
						break;
					}
				}
				// always conclude
				done();
			});
		}
	];

	async.series( actions, function( err, results){
		// concluding run...
		// error control
		switch( err ){
			case 'empty':
				self.emit('cleaned');
			break;
		}
		// re-run (flag) if queue not paused and not empty...
		if( !self.queue.paused && err !== "empty" ) self.run();

	});

};



// Private methods



// Exports

module.exports = function(name, options){
	var main = new Main(name, options);
	return main;
}
