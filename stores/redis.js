/**
 * Store: Redis
 * - Saving data using a Redis db
**/

var redis = require('redis');


var CRUD = function( options ){

	// use the provided db (error control?)
	if( options.db ){
		this.db = options.db
	} else {
		this.db = redis.createClient(options.redis.port, options.redis.host, options.redis.opt);
		// select the database
		this.db.select(options.redis.database, function(err,res){
			// you'll want to check that the select was successful here
			// if(err) return err;
		});
	}

}

CRUD.prototype = {

	constructor: CRUD,

	create: function( data, callback ){
		// fallbacks
		data = data || {};
		var key = data.id || false;
		if( !key ) return callback(null, false);
		var expires = (data.expires_in) ? parseInt(data.expires_in) : 86400000; // default one day...
		// if refresh_token, add 60 days...
		if( data.refresh_token) expires += (60 * 86400000); // plus 60 days for refresh_token
		// convert ttl to seconds
		var ttl = Math.floor( expires / 1000 );
		// stringify data
		data = JSON.stringify(data);
		// connect to db
		this.db.setex( key, ttl, data, function(err, result){
			if(err) return callback(err);
			// error control?
			return callback( null, true );
		});
	},

	read: function( query, callback ){
		var key = query.id || "*";
		if( !key ) return callback(null, false); // how to return all data?
		// connect to db
		this.db.get( key, function(err, data){
			if(err) return callback(err);
			// parse data into an object
			data = JSON.parse( data.toString() );
			callback( null, data );
		});
	},

	destroy: function( item, callback ){
		var key = item.id || false;
		if( !key ) return callback(null, false);
		// connect to db
		this.db.del( key, function(err, data){
			if(err) return callback(err);
			callback( null, true );
		});
	},

	// Helpers
	// - list a set of keys
	list: function( prefix, callback ){
		// fallback
		prefix = prefix || "";

		this.db.keys( prefix +"*", function(err, keys) {
			if( callback ) return callback( keys );
			return keys;
		});

	},

	// FIX THIS: query not implemented for redis yet...
	query: function( query, callback ){
		var key = query.id || false;
		if( !key ) return callback(null, false);
		// connect to db
		this.db.get( key, function(err, data){
			if(err) return callback(err);
			// parse data into an object
			data = JSON.parse( data.toString() );
			callback( null, data );
		});
	}
}


module.exports = CRUD;
