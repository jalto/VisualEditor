/**
 * Creates an es.EquationModel object.
 * 
 * @class
 * @constructor
 * @extends {es.DocumentModelLeafNode}
 * @param {Object} element Document data element of this node
 * @param {Integer} length Length of document data element
 */
es.EquationModel = function( element, length ) {
	// Inheritance
	es.DocumentModelLeafNode.call( this, 'equation', element, length );
};

/* Methods */

/**
 * Creates a equation view for this model.
 * 
 * @method
 * @returns {es.EquationView}
 */
es.EquationModel.prototype.createView = function() {
	return new es.EquationView( this );
};

/* Registration */

es.DocumentModel.nodeModels.equation = es.EquationModel;

es.DocumentModel.nodeRules.equation = {
	'parents': null,
	'children': []
};

/* Inheritance */

es.extendClass( es.EquationModel, es.DocumentModelLeafNode );
