/**
 * Creates an es.ContextView object.
 * 
 * @class
 * @constructor
 * @param {jQuery} $overlay DOM selection to add nodes to
 */
es.ContextView = function( surfaceView, $overlay ) {
	this.surfaceView = surfaceView;
	this.$ = $( '<div class="es-contextView"></div>' ).appendTo( $overlay || $( 'body' ) );
	this.$menu = $( '<div class="es-contextView-menu"></div>' ).appendTo( this.$ );
	this.$icon = $( '<div class="es-contextView-icon"></div>' ).appendTo( this.$ );

	// Example menu items
	this.$menu.append(
		'<div class="es-contextView-menuSection">' +
			'<div class="es-contextView-menuButton es-contextView-menuButton-bold"></div>' +
			'<div class="es-contextView-menuButton es-contextView-menuButton-italic"></div>' +
			'<div class="es-contextView-menuButton es-contextView-menuButton-clear"></div>' +
		'</div>' +
		'<div class="es-contextView-menuItem-break"></div>' +
		'<div class="es-contextView-menuItem">Cut</div>' +
		'<div class="es-contextView-menuItem">Copy</div>' +
		'<div class="es-contextView-menuItem">Paste</div>' +
		'<div class="es-contextView-menuItem">Delete</div>' +
		'<div class="es-contextView-menuItem-break"></div>' +
		'<div class="es-contextView-menuItem">Convert to...</div>'
	);

	// Events
	var _this = this;
	this.$icon.click( function() {
		_this.$menu.toggle();
	} );
};

/* Methods */

es.ContextView.prototype.set = function() {
	this.$.removeClass(
		'es-contextView-position-below es-contextView-position-above ' +
		'es-contextView-position-left es-contextView-position-right'
	);
	var selection = this.surfaceView.getModel().getSelection(),
		position,
		offset,
		bias;
	if ( selection.from < selection.to ) {
		var $lastRange = this.surfaceView.$.find( '.es-contentView-range:visible:last' );
		if ( $lastRange.length ) {
			offset = $lastRange.offset();
			position = new es.Position(
				offset.left + $lastRange.width(), offset.top + $lastRange.height()
			);
			this.$.addClass( 'es-contextView-position-below' );
		}
	} else if ( selection.from > selection.to ) {
		var $firstRange = this.surfaceView.$.find( '.es-contentView-range:visible:first' );
		if ( $firstRange.length ) {
			offset = $firstRange.offset();
			position = new es.Position( offset.left, offset.top );
			this.$.addClass( 'es-contextView-position-above' );
		}
	}
	if ( position ) {
		if ( position.left + this.$menu.width() < $( 'body' ).width() ) {
			this.$.addClass( 'es-contextView-position-left' );
		} else {
			this.$.addClass( 'es-contextView-position-right' );
		}
		this.$.css( { 'left': position.left, 'top': position.top } );
		this.$icon.fadeIn( 'fast' );
	}
};

es.ContextView.prototype.clear = function() {
	this.$icon.hide();
	this.$menu.hide();
};
