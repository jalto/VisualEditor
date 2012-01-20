/**
 * Template and template argument handling, first cut.
 *
 * AsyncTokenTransformManager objects provide preprocessor-frame-like
 * functionality once template args etc are fully expanded, and isolate
 * individual transforms from concurrency issues. Template expansion is
 * controlled using a tplExpandData structure created independently for each
 * handled template tag.
 *
 * @author Gabriel Wicke <gwicke@wikimedia.org>
 * @author Brion Vibber <brion@wikimedia.org>
 */
var $ = require('jquery'),
	request = require('request'),
	qs = require('querystring'),
	AttributeTransformManager = require('./mediawiki.TokenTransformManager.js')
									.AttributeTransformManager;


function TemplateHandler ( manager ) {
	this.reset();
	this.register( manager );
}

TemplateHandler.prototype.reset = function ( token ) {
	return {token: token};
};

// constants
TemplateHandler.prototype.rank = 1.1;

TemplateHandler.prototype.register = function ( manager ) {
	this.manager = manager;
	// Register for template and templatearg tag tokens
	manager.addTransform( this.onTemplate.bind(this), 
			this.rank, 'tag', 'template' );

	// Template argument expansion
	manager.addTransform( this.onTemplateArg.bind(this), 
			this.rank, 'tag', 'templatearg' );

};


/** 
 * Main template token handler
 *
 * Expands target and arguments (both keys and values) and either directly
 * calls or sets up the callback to _expandTemplate, which then fetches and
 * processes the template.
 */
TemplateHandler.prototype.onTemplate = function ( token, cb ) {
	//console.log('onTemplate! ' + JSON.stringify( token, null, 2 ) + 
	//		' args: ' + JSON.stringify( this.manager.args ));


	// create a new temporary frame for argument and title expansions
	var tplExpandData = {
			args: {},
			manager: this.manager,
			cb: cb,
			origToken: token,
			resultTokens: [],
			attribsAsync: true,
			overallAsync: false,
			expandDone: false
		},
		transformCB,
		i = 0,
		kvs = [],
		res,
		kv;

	var attributes = [[[{ type: 'TEXT', value: '' }] , token.target ]]
			.concat( this._nameArgs( token.orderedArgs ) );

	//console.log( 'before AttributeTransformManager: ' + 
	//					JSON.stringify( attributes, null, 2 ) );
	new AttributeTransformManager( 
				this.manager, 
				this._returnAttributes.bind( this, tplExpandData ) 
			).process( attributes );

	// Unblock finish
	if ( ! tplExpandData.attribsAsync ) {
		// Attributes were transformed synchronously
		this.manager.env.dp( 'sync attribs for ' + JSON.stringify( token ));
		// All attributes are fully expanded synchronously (no IO was needed)
		return this._expandTemplate ( tplExpandData );
	} else {
		// Async attribute expansion is going on
		this.manager.env.dp( 'async return for ' + JSON.stringify( token ));
		tplExpandData.overallAsync = true;
		return { async: true };
	}
};

/**
 * Create positional (number) keys for arguments without explicit keys
 */
TemplateHandler.prototype._nameArgs = function ( orderedArgs ) {
	var n = 1,
		out = [];
	for ( var i = 0, l = orderedArgs.length; i < l; i++ ) {
		if ( ! orderedArgs[i][0].length ) {
			out.push( [[{ type: 'TEXT', value: n }], orderedArgs[i][1]]);
			n++;
		} else {
			out.push( orderedArgs[i] );
		}
	}
	//console.log( '_nameArgs: ' + JSON.stringify( out ) );
	return out;
};

/**
 * Callback for argument (including target) expansion in AttributeTransformManager
 */
TemplateHandler.prototype._returnAttributes = function ( tplExpandData, 
															attributes ) 
{
	this.manager.env.dp( 'TemplateHandler._returnAttributes: ' + JSON.stringify(attributes) );
	// Remove the target from the attributes
	tplExpandData.attribsAsync = false;
	tplExpandData.target = attributes[0][1];
	attributes.shift();
	tplExpandData.expandedArgs = attributes;
	if ( tplExpandData.overallAsync ) {
		this._expandTemplate ( tplExpandData );
	}
};

/**
 * Fetch, tokenize and token-transform a template after all arguments and the
 * target were expanded.
 */
TemplateHandler.prototype._expandTemplate = function ( tplExpandData ) {
	//console.log('TemplateHandler.expandTemplate: ' +
	//		JSON.stringify( tplExpandData, null, 2 ) );

	
	if ( ! tplExpandData.target ) {
		this.manager.env.dp( 'No target! ' + 
				JSON.stringify( tplExpandData, null, 2 ) );
		console.trace();
	}

	// TODO:
	// check for 'subst:'
	// check for variable magic names
	// check for msg, msgnw, raw magics
	// check for parser functions

	// First, check the target for loops
	var target = this.manager.env.normalizeTitle(
			this.manager.env.tokensToString( tplExpandData.target )
		);
	var checkRes = this.manager.loopAndDepthCheck.check( target );
	if( checkRes ) {
		// Loop detected, abort!
		return {
			tokens: [
				{ 
					type: 'TEXT', 
					value: checkRes
				},
				{
					type: 'TAG',
					name: 'a',
					attrib: [['href', target]]
				},
				{
					type: 'TEXT',
					value: target
				},
				{
					type: 'ENDTAG',
					name: 'a'
				}
			]
		};
	}

	// Get a nested transformation pipeline for the input type. The input
	// pipeline includes the tokenizer, synchronous stage-1 transforms for
	// 'text/wiki' input and asynchronous stage-2 transforms). 
	var inputPipeline = this.manager.newChildPipeline( 
				this.manager.inputType || 'text/wiki', 
				this.manager.env.KVtoHash( tplExpandData.expandedArgs ),
				tplExpandData.target
			);

	// Hook up the inputPipeline output events to our handlers
	inputPipeline.addListener( 'chunk', this._onChunk.bind ( this, tplExpandData ) );
	inputPipeline.addListener( 'end', this._onEnd.bind ( this, tplExpandData ) );
	

	// Resolve a possibly relative link
	var templateName = this.manager.env.resolveTitle( 
			target,
			'Template' 
		);

	// XXX: notes from brion's mediawiki.parser.environment
	// resolve template name
	// load template w/ canonical name
	// load template w/ variant names (language variants)

	// For now, just fetch the template and pass the callback for further
	// processing along.
	this._fetchTemplateAndTitle( 
			templateName, 
			this._processTemplateAndTitle.bind( this, inputPipeline ),
			tplExpandData
		);

	// If nothing was async so far and the template source was retrieved and
	// fully processed without async requests (using the cache), then
	// expandDone is set to true in our _onEnd handler.
	if ( tplExpandData.overallAsync || 
			! tplExpandData.expandDone ) {
		tplExpandData.overallAsync = true;
		this.manager.env.dp( 'Async return from _expandTemplate for ' + 
				JSON.stringify ( tplExpandData.target ) );
		return { async: true };
	} else {
		this.manager.env.dp( 'Sync return from _expandTemplate for ' + 
				JSON.stringify( tplExpandData.target ) + ' : ' +
				JSON.stringify( tplExpandData.result ) 
				);
		return tplExpandData.result;
	}
};


/**
 * Handle chunk emitted from the input pipeline after feeding it a template
 */
TemplateHandler.prototype._onChunk = function( tplExpandData, chunk ) {
	// We encapsulate the output by default, so collect tokens here.
	this.manager.env.dp( 'TemplateHandler._onChunk' + JSON.stringify( chunk ) );
	tplExpandData.resultTokens = tplExpandData.resultTokens.concat( chunk );
};

/**
 * Handle the end event emitted by the parser pipeline after fully processing
 * the template source.
 */
TemplateHandler.prototype._onEnd = function( tplExpandData, token ) {
	this.manager.env.dp( 'TemplateHandler._onEnd' + JSON.stringify( tplExpandData.resultTokens ) );
	tplExpandData.expandDone = true;
	var res = tplExpandData.resultTokens;
	// Remove 'end' token from end
	if ( res.length && res[res.length - 1].type === 'END' ) {
		res.pop();
	}

	// Could also encapsulate the template tokens here, if that turns out
	// better for the editor.

	//console.log( 'TemplateHandler._onEnd: ' + JSON.stringify( res, null, 2 ) );

	if ( tplExpandData.overallAsync ) {
		this.manager.env.dp( 'TemplateHandler._onEnd: calling back with res:' +
				JSON.stringify( res ) );
		tplExpandData.cb( res, false );
	} else {
		this.manager.env.dp( 'TemplateHandler._onEnd: synchronous return!' );
		tplExpandData.result = { tokens: res };
		//data.reset();
	}
};



/**
 * Process a fetched template source
 */
TemplateHandler.prototype._processTemplateAndTitle = function( pipeline, src, title ) {
	// Feed the pipeline. XXX: Support different formats.
	this.manager.env.dp( 'TemplateHandler._processTemplateAndTitle: ' + src );
	pipeline.process ( src );
};



/**
 * Fetch a template
 */
TemplateHandler.prototype._fetchTemplateAndTitle = function ( title, callback, tplExpandData ) {
	// @fixme normalize name?
	var self = this;
	if (title in this.manager.env.pageCache) {
		// Unroll the stack here
		process.nextTick(
				function () {
					callback( self.manager.env.pageCache[title], title )
				} 
		);
	} else if ( ! this.manager.env.fetchTemplates ) {
		callback('Page/template fetching disabled, and no cache for ' + title);
	} else {
		// Not found in the pageCache, so go fetch the source using the
		// MediaWiki API.

		// We are about to start an async request for a template, so mark this
		// template expansion as such.
		tplExpandData.overallAsync = true;
		this.manager.env.dp( 'trying to fetch ' + title );
		//console.log(this.manager.env.pageCache);
		var url = this.manager.env.wgScriptPath + '/api' + 
			this.manager.env.wgScriptExtension +
			'?' + 
			qs.stringify( {
				format: 'json',
				action: 'query',
				prop: 'revisions',
				rvprop: 'content',
				titles: title
			} );
			//'?format=json&action=query&prop=revisions&rvprop=content&titles=' + title;

		request({
			method: 'GET',
			followRedirect: true,
			url: url,
			headers: { 
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:9.0.1) ' +
								'Gecko/20100101 Firefox/9.0.1 Iceweasel/9.0.1' 
			}
		}, 
		function (error, response, body) {
			//console.log( 'response for ' + title + ' :' + body + ':' );
			if(error) {
				self.manager.env.dp(error);	
				callback('Page/template fetch failure for title ' + title, title);
				return ;
			}

			if(response.statusCode ==  200) {
				var src = '';
				try {
					//console.log( 'body: ' + body );
					var data = JSON.parse( body );
				} catch(e) {
					console.log( "Error: while parsing result. Error was: " );
					console.log( e );
					console.log( "Response that didn't parse was:");
					console.log( "------------------------------------------\n" + body );
					console.log( "------------------------------------------" );
				}
				try {
					$.each(data.query.pages, function(i, page) {
						if (page.revisions && page.revisions.length) {
							src = page.revisions[0]['*'];
							title = page.title;
						}
					});
				} catch ( e ) {
					console.log( 'Did not find page revisions in the returned body:' + body );
					src = '';
				}
				//console.log( 'Page ' + title + ': got ' + src );
				self.manager.env.dp( 'Success for ' + title + ' :' + body + ':' );
				self.manager.env.pageCache[title] = src;
				callback(src, title);
				self.manager.env.dp(data);
			}
		});

		/*
		 * XXX: The jQuery version does not quite work with node, but we keep
		 * it around for now.
		$.ajax({
			url: url,
			data: {
				format: 'json',
				action: 'query',
				prop: 'revisions',
				rvprop: 'content',
				titles: title
			},
			success: function(data, statusString, xhr) {
				console.log( 'Page ' + title + ' success ' + JSON.stringify( data ) );
				var src = null, title = null;
				$.each(data.query.pages, function(i, page) {
					if (page.revisions && page.revisions.length) {
						src = page.revisions[0]['*'];
						title = page.title;
					}
				});
				if (typeof src !== 'string') {
					console.log( 'Page ' + title + 'not found! Got ' + src );
					callback( 'Page ' + title + ' not found' );
				} else {
					// Add to cache
					console.log( 'Page ' + title + ': got ' + src );
					this.manager.env.pageCache[title] = src;
					callback(src, title);
				}
			},
			error: function(xhr, msg, err) {
				console.log( 'Page/template fetch failure for title ' + 
						title + ', url=' + url + JSON.stringify(xhr) + ', err=' + err );
				callback('Page/template fetch failure for title ' + title);
			},
			dataType: 'json',
			cache: false, // @fixme caching, versions etc?
			crossDomain: true
		});
		*/
	}
};


/*********************** Template argument expansion *******************/

/**
 * Expand template arguments with tokens from the containing frame.
 */
TemplateHandler.prototype.onTemplateArg = function ( token, cb, frame ) {
	
	var attributes = [[token.argname, token.defaultvalue]];

	token.resultTokens = false;

	new AttributeTransformManager( 
				this.manager, 
				this._returnArgAttributes.bind( this, token, cb, frame ) 
			).process( attributes );

	if ( token.resultTokens !== false ) {
		// synchronous return
		//console.log( 'synchronous attribute expand: ' + JSON.stringify( token.resultTokens ) );

		return { tokens: token.resultTokens };
	} else {
		//console.log( 'asynchronous attribute expand: ' + JSON.stringify( token, null, 2 ) );
		// asynchronous return
		token.resultTokens = [];
		return { async: true };
	}
};

TemplateHandler.prototype._returnArgAttributes = function ( token, cb, frame, attributes ) {
	//console.log( '_returnArgAttributes: ' + JSON.stringify( attributes ));
	var argName = this.manager.env.tokensToString( attributes[0][0] ).trim(),
		defaultValue = attributes[0][1],
		res;
	if ( argName in this.manager.args ) {
		// return tokens for argument
		//console.log( 'templateArg found: ' + argName + 
		//		' vs. ' + JSON.stringify( this.manager.args ) ); 
		res = this.manager.args[argName];
	} else {
		//console.log( 'templateArg not found: ' + argName + 
		//		' vs. ' + JSON.stringify( this.manager.args ) );
		if ( token.attribs.length > 1 ) {
			res = defaultValue;
		} else {
			res = [{ type: 'TEXT', value: '{{{' + argName + '}}}' }];
		}
	}
	if ( token.resultTokens !== false ) {
		cb( res );
	} else {
		token.resultTokens =  res;
	}
};

if (typeof module == "object") {
	module.exports.TemplateHandler = TemplateHandler;
}
