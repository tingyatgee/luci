'use strict';
'require view';
'require form';
'require tools.widgets as widgets';

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('dropbear', _('SSH Access'));

		s = m.section(form.TypedSection, 'dropbear', _('Dropbear Instance'));
		s.anonymous = true;
		s.addremove = true;
		s.addbtntitle = _('Add instance');

		o = s.option(form.Flag, 'enable', _('Enable Instance'));
		o.default  = o.enabled;

		o = s.option(widgets.NetworkSelect, 'Interface', _('Interface'));
		o.nocreate    = true;

		o = s.option(form.Value, 'Port', _('Port'));
		o.datatype    = 'port';
		o.placeholder = 22;

		o = s.option(form.Flag, 'PasswordAuth', _('Password authentication'));
		o.enabled  = 'on';
		o.disabled = 'off';
		o.default  = o.enabled;
		o.rmempty  = false;

		o = s.option(form.Flag, 'RootPasswordAuth', _('Logins with password'));
		o.enabled  = 'on';
		o.disabled = 'off';
		o.default  = o.enabled;

		o = s.option(form.Flag, 'GatewayPorts', _('Gateway Ports'));
		o.enabled  = 'on';
		o.disabled = 'off';
		o.default  = o.disabled;

		return m.render();
	}
});
