/**
 * Command line wikidom parse utility.
 * Read from STDIN, write to STDOUT.
 *
 * @author Neil Kandalgaonkar <neilk@wikimedia.org>
 * @author Gabriel Wicke <gwicke@wikimedia.org>
 */

var ParserPipeline = require('./mediawiki.parser.js').ParserPipeline,
	ParserEnv = require('./mediawiki.parser.environment.js').MWParserEnvironment,
	DOMConverter = require('./mediawiki.DOMConverter.js').DOMConverter,
	optimist = require('optimist');

( function() { 
	var argv = optimist.usage( 'Usage: $0', {
		'html': {
			description: 'Produce html output instead of WikiDom',
			'boolean': true,
			'default': false
		},
		'debug': {
			description: 'Debug mode',
			'boolean': true,
			'default': false
		}
	}).argv;


	var env = new ParserEnv( { 
						// fetch templates from enwiki by default..
						wgScriptPath: "http://en.wikipedia.org/w",
						wgScriptExtension: ".php",
						fetchTemplates: true,
						// enable/disable debug output using this switch	
						debug: argv.debug
					} ),
		parser = new ParserPipeline( env );


	process.stdin.resume();
	process.stdin.setEncoding('utf8');

	var inputChunks = [];
	process.stdin.on( 'data', function( chunk ) {
		inputChunks.push( chunk );
	} );



	process.stdin.on( 'end', function() { 
		var input = inputChunks.join('');
		parser.on('document', function ( document ) {
			if ( ! argv.html ) {
				var wikiDom = new DOMConverter().HTMLtoWiki( document.body ),
				// Serialize the WikiDom with indentation
				output = JSON.stringify( wikiDom, null, 2 );
				process.stdout.write( output );
			} else {
				// Print out the html
				process.stdout.write( document.body.innerHTML );
			}
			// add a trailing newline for shell user's benefit
			process.stdout.write( "\n" );
			process.exit(0);
		});
		// Kick off the pipeline by feeding the input into the parser pipeline
		parser.parse( input );
	} );

} )();
