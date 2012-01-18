/**
 * Command line wikidom parse utility.
 * Read from STDIN, write to STDOUT.
 */


( function() { 

	var ParserPipeline = require('./mediawiki.parser.js').ParserPipeline,
		ParserEnv = require('./mediawiki.parser.environment.js').MWParserEnvironment,
		DOMConverter = require('./mediawiki.DOMConverter.js').DOMConverter,
		optimist = require('optimist');

	var parser = new ParserPipeline( new ParserEnv({ fetchTemplates: true }) );


	process.stdin.resume();
	process.stdin.setEncoding('utf8');

	var inputChunks = [];
	process.stdin.on( 'data', function( chunk ) {
		inputChunks.push( chunk );
	} );



	process.stdin.on( 'end', function() { 
		var input = inputChunks.join('');
		parser.on('document', function ( document ) {
			var wikiDom = new DOMConverter().HTMLtoWiki( document.body ),
				// Serialize the WikiDom with indentation
				output = JSON.stringify( wikiDom, null, 2 );
			process.stdout.write( output );
			// add a trailing newline for shell user's benefit
			process.stdout.write( "\n" );
			process.exit(0);
		});
		// Kick off the pipeline by feeding the input into the parser pipeline
		parser.parse( input );
	} );

} )();
