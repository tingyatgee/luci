'use strict';
'require view';
'require form';
'require rpc';
'require tools.widgets as widgets';

//	[Widget, Option, Title, Description, {Param: 'Value'}],
var startupConf = [
	[form.Flag, 'stdout', _('Log stdout')],
	[form.Flag, 'stderr', _('Log stderr')],
	[widgets.UserSelect, 'user', _('Run daemon as user')],
	[widgets.GroupSelect, 'group', _('Run daemon as group')],
	[form.Flag, 'respawn', _('Respawn when crashed')],
	[form.DynamicList, 'env', _('Environment variable'), {placeholder: 'ENV_NAME=value'}],
	[form.DynamicList, 'conf_inc', _('Additional configs'), {placeholder: '/etc/frp/frps.d/frps_full.ini'}]
];

var commonConf = [
	[form.Value, 'bind_addr', _('Bind address'), {datatype: 'ipaddr'}],
	[form.Value, 'bind_port', _('Bind port'), {datatype: 'port'}],
	[form.Value, 'bind_udp_port', _('UDP bind port'), {datatype: 'port'}],
	[form.Value, 'kcp_bind_port', _('KCP bind port'), {datatype: 'port'}],
	[form.Value, 'proxy_bind_addr', _('Proxy bind address'), {datatype: 'ipaddr'}],
	[form.Value, 'vhost_http_port', _('Vhost HTTP port'), {datatype: 'port'}],
	[form.Value, 'vhost_https_port', _('Vhost HTTPS port'), {datatype: 'port'}],
	[form.Value, 'vhost_http_timeout', _('Vhost HTTP timeout'), {datatype: 'uinteger'}],
	[form.Value, 'dashboard_addr', _('Dashboard address'), {datatype: 'ipaddr'}],
	[form.Value, 'dashboard_port', _('Dashboard port'), {datatype: 'port'}],
	[form.Value, 'dashboard_user', _('Dashboard user')],
	[form.Value, 'dashboard_pwd', _('Dashboard password'), {password: true}],
	[form.Value, 'assets_dir', _('Assets dir')],
	[form.Value, 'log_file', _('Log file')],
	[form.ListValue, 'log_level', _('Log level'), _(''), {values: ['trace', 'debug', 'info', 'warn', 'error']}],
	[form.Value, 'log_max_days', _('Log max days'), {datatype: 'uinteger'}],
	[form.Value, 'token', _('Token')],
	[form.Value, 'subdomain_host', _('Subdomain host')],
	[form.Flag, 'tcp_mux', _('TCP mux'), {datatype: 'bool', default: 'true'}],
	[form.Value, 'custom_404_page', _('Custom 404 page')],
	[form.Value, 'allow_ports', _('Allow ports')],
	[form.Value, 'max_ports_per_client', _('Max ports per client'), {datatype: 'uinteger'}],
	[form.Value, 'heartbeat_timeout', _('Heartbeat timeout'), {datatype: 'uinteger'}],
	[form.DynamicList, '_', _('Additional settings'), {placeholder: 'Key-A=Value-A'}]
];

function setParams(o, params) {
	if (!params) return;
	for (var key in params) {
		var val = params[key];
		if (key === 'values') {
			for (var j = 0; j < val.length; j++) {
				var args = val[j];
				if (!Array.isArray(args))
					args = [args];
				o.value.apply(o, args);
			}
		} else if (key === 'depends') {
			if (!Array.isArray(val))
				val = [val];
			for (var j = 0; j < val.length; j++) {
				var args = val[j];
				if (!Array.isArray(args))
					args = [args];
				o.depends.apply(o, args);
			}
		} else {
			o[key] = params[key];
		}
	}
	if (params['datatype'] === 'bool') {
		o.enabled = 'true';
		o.disabled = 'false';
	}
}

function defTabOpts(s, t, opts, params) {
	for (var i = 0; i < opts.length; i++) {
		var opt = opts[i];
		var o = s.taboption(t, opt[0], opt[1], opt[2], opt[3]);
		setParams(o, opt[4]);
		setParams(o, params);
	}
}

function defOpts(s, opts, params) {
	for (var i = 0; i < opts.length; i++) {
		var opt = opts[i];
		var o = s.option(opt[0], opt[1], opt[2], opt[3]);
		setParams(o, opt[4]);
		setParams(o, params);
	}
}

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('frps'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['frps']['instances']['instance1']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning) {
	var renderHTML = "";
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';

	if (isRunning) {
		renderHTML += String.format(spanTemp, 'green', _("frp Server"), _("RUNNING"));
	} else {
		renderHTML += String.format(spanTemp, 'red', _("frp Server"), _("NOT RUNNING"));
	}

	return renderHTML;
}

return view.extend({
	render: function() {
		let m, s, o;

		m = new form.Map('frps', _('frp Server'));

		s = m.section(form.NamedSection, '_status');
		s.anonymous = true;
		s.render = function (section_id) {
			L.Poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function(res) {
					var view = document.getElementById("service_status");
					view.innerHTML = renderStatus(res);
				});
			});

			return E('div', { class: 'cbi-map' },
				E('fieldset', { class: 'cbi-section'}, [
					E('p', { id: 'service_status' },
						_('Collecting data ...'))
				])
			);
		}

		s = m.section(form.NamedSection, 'common', 'conf');
		s.dynamic = true;

		s.tab('common', _('Common settings'));
		s.tab('init', _('Startup settings'));

		defTabOpts(s, 'common', commonConf, {optional: true});

		o = s.taboption('init', form.SectionValue, 'init', form.TypedSection, 'init', _('Startup settings'));
		s = o.subsection;
		s.anonymous = true;
		s.dynamic = true;

		defOpts(s, startupConf);

		return m.render();
	}
});
