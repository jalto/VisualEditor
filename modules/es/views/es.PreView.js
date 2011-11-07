/**
 * Creates an es.PreView object.
 * 
 * @class
 * @constructor
 * @extends {es.DocumentViewLeafNode}
 * @param {es.PreModel} model Pre model to view
 */
es.PreView = function( model ) {
	// Inheritance
	es.DocumentViewLeafNode.call( this, model );

	// DOM Changes
	this.$.addClass( 'es-preView' );
};

/* Inheritance */

es.extendClass( es.PreView, es.DocumentViewLeafNode );
