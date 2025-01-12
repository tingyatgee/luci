'use strict';
'require view';
'require form';
'require tools.widgets as widgets';

return view.extend({
	render: function() {
		let m, s, o;

		m = new form.Map('ttyd');

		s = m.section(form.TypedSection, 'ttyd', _('ttyd Instance'));
		s.anonymous   = true;
		s.addremove   = true;
		s.addbtntitle = _('Add instance');

		o = s.option(form.Flag, 'enable', _('Enable'));
		o.default = true;

		s.option(form.Flag, 'unix_sock', _('UNIX socket'));

		o = s.option(form.Value, 'port', _('Port'));
		o.depends('unix_sock', '0');
		o.datatype    = 'port';
		o.placeholder = 7681;

		o = s.option(widgets.DeviceSelect, 'interface', _('Interface'));
		o.depends('unix_sock', '0');
		o.nocreate    = true;

		o = s.option(form.Value, '_unix_sock_path', _('UNIX socket path'));
		o.depends('unix_sock', '1');
		o.ucioption = 'interface';
		o.retain = true;

		o = s.option(form.Value, 'credential', _('Credential'));
		o.placeholder = 'username:password';

		s.option(form.Flag, 'readonly', _('Read-only'));

		s.option(form.Flag, 'ipv6', _('IPv6'));

		s.option(form.Flag, 'ssl', _('SSL'));

		o = s.option(form.Value, 'ssl_cert', _('SSL cert'));
		o.depends('ssl', '1');

		o = s.option(form.Value, 'ssl_key', _('SSL key'));
		o.depends('ssl', '1');

		o = s.option(form.Value, 'ssl_ca', _('SSL ca'));
		o.depends('ssl', '1');

		o = s.option(form.ListValue, 'debug', _('Debug'));
		o.value('1', _('Error'));
		o.value('3', _('Warning'));
		o.value('7', _('Notice'));
		o.value('15', _('Info'));
		o.default = '7';

		s.option(form.Value, 'command', _('Command'));

		return m.render();
	}
});
