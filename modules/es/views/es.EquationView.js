/**
 * Creates an es.EquationView object.
 * 
 * @class
 * @constructor
 * @extends {es.DocumentViewLeafNode}
 * @param {es.EquationModel} model Equation model to view
 */
es.EquationView = function( model ) {
	// Inheritance
	es.DocumentViewLeafNode.call( this, model );

	// DOM Changes
	this.$.addClass( 'es-equationView' );
};

/* Registration */

es.DocumentView.splitRules.equation = {
	'self': true,
	'children': null
};

/* Inheritance */

es.extendClass( es.EquationView, es.DocumentViewLeafNode );
