'use strict';
'require baseclass';
'require form';

return baseclass.extend({
	trigger: _('Heartbeat interval (kernel: heartbeat)'),
	kernel: true,
	addFormOptions: function(s) {
		var o;

		o = s.option(form.Flag, 'inverted', _('Invert blinking'));
		o.rmempty = true;
		o.modalonly = true;
		o.depends('trigger', 'heartbeat');
	}
});
