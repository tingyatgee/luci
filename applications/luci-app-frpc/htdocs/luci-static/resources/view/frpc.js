'use strict';
'require view';
'require ui';
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
	[form.DynamicList, 'conf_inc', _('Additional configs'), {placeholder: '/etc/frp/frpc.d/frpc_full.ini'}]
];

var commonConf = [
	[form.Value, 'server_addr', _('Server address'), {datatype: 'host'}],
	[form.Value, 'server_port', _('Server port'), {datatype: 'port'}],
	[form.Value, 'http_proxy', _('HTTP proxy')],
	[form.Value, 'log_file', _('Log file')],
	[form.ListValue, 'log_level', _('Log level'), _(''), {values: ['trace', 'debug', 'info', 'warn', 'error']}],
	[form.Value, 'log_max_days', _('Log max days'), {datatype: 'uinteger'}],
	[form.Value, 'token', _('Token')],
	[form.Value, 'admin_addr', _('Admin address'), {datatype: 'ipaddr'}],
	[form.Value, 'admin_port', _('Admin port'), {datatype: 'port'}],
	[form.Value, 'admin_user', _('Admin user')],
	[form.Value, 'admin_pwd', _('Admin password'), {password: true}],
	[form.Value, 'assets_dir', _('Assets dir')],
	[form.Flag, 'tcp_mux', _('TCP mux'), {datatype: 'bool', default: 'true'}],
	[form.Value, 'user', _('User')],
	[form.Flag, 'login_fail_exit', _('Exit when login fail'), {datatype: 'bool', default: 'true'}],
	[form.ListValue, 'protocol', _('Protocol'), _(''), {values: ['tcp', 'kcp', 'websocket']}],
	[form.Flag, 'tls_enable', _('TLS'), {datatype: 'bool'}],
	[form.Value, 'heartbeat_interval', _('Heartbeat interval'), {datatype: 'uinteger'}],
	[form.Value, 'heartbeat_timeout', _('Heartbeat timeout'), {datatype: 'uinteger'}],
	[form.DynamicList, '_', _('Additional settings'), {placeholder: 'Key-A=Value-A'}]
];

var baseProxyConf = [
	[form.Value, 'name', _('Proxy name'), undefined, {rmempty: false, optional: false}],
	[form.ListValue, 'type', _('Proxy type'), _(''), {values: ['tcp', 'udp', 'http', 'https', 'stcp', 'xtcp']}],
	[form.Flag, 'use_encryption', _('Encryption'), {datatype: 'bool'}],
	[form.Flag, 'use_compression', _('Compression'), {datatype: 'bool'}],
	[form.Value, 'local_ip', _('Local IP'), {datatype: 'host'}],
	[form.Value, 'local_port', _('Local port'), {datatype: 'port'}],
];

var bindInfoConf = [
	[form.Value, 'remote_port', _('Remote port'), {datatype: 'port'}]
];

var domainConf = [
	[form.Value, 'custom_domains', _('Custom domains')],
	[form.Value, 'subdomain', _('Subdomain')],
];

var httpProxyConf = [
	[form.Value, 'locations', _('Locations')],
	[form.Value, 'http_user', _('HTTP user')],
	[form.Value, 'http_pwd', _('HTTP password')],
	[form.Value, 'host_header_rewrite', _('Host header rewrite')],
	// [form.Value, 'headers', _('Headers')], // FIXME
];

var stcpProxyConf = [
	[form.ListValue, 'role', _('Role'), undefined, {values: ['server', 'visitor']}],
	[form.Value, 'server_name', _('Server name'), undefined, {depends: [{role: 'visitor'}]}],
	[form.Value, 'sk', _('Sk')],
];

var pluginConf = [
	[form.ListValue, 'plugin', _('Plugin'), undefined, {values: ['', 'http_proxy', 'socks5', 'unix_domain_socket'], rmempty: true}],
	[form.Value, 'plugin_http_user', _('HTTP user'), undefined, {depends: {plugin: 'http_proxy'}}],
	[form.Value, 'plugin_http_passwd', _('HTTP password'), undefined, {depends: {plugin: 'http_proxy'}}],
	[form.Value, 'plugin_user', _('SOCKS5 user'), undefined, {depends: {plugin: 'socks5'}}],
	[form.Value, 'plugin_passwd', _('SOCKS5 password'), undefined, {depends: {plugin: 'socks5'}}],
	[form.Value, 'plugin_unix_path', _('Unix domain socket path'), undefined, {depends: {plugin: 'unix_domain_socket'}, optional: false, rmempty: false,
		datatype: 'file', placeholder: '/var/run/docker.sock', default: '/var/run/docker.sock'}],
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

			var deps = [];
			for (var j = 0; j < val.length; j++) {
				var d = {};
				for (var vkey in val[j])
					d[vkey] = val[j][vkey];
				for (var k = 0; k < o.deps.length; k++) {
					for (var dkey in o.deps[k]) {
						d[dkey] = o.deps[k][dkey];
					}
				}
				deps.push(d);
			}
			o.deps = deps;
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
	return L.resolveDefault(callServiceList('frpc'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['frpc']['instances']['instance1']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning) {
	var renderHTML = "";
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';

	if (isRunning) {
		renderHTML += String.format(spanTemp, 'green', _("frp Client"), _("RUNNING"));
	} else {
		renderHTML += String.format(spanTemp, 'red', _("frp Client"), _("NOT RUNNING"));
	}

	return renderHTML;
}

return view.extend({
	render: function() {
		let m, s, o;

		m = new form.Map('frpc', _('frp Client'));

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

		s.tab('common', _('Common Settings'));
		s.tab('init', _('Startup Settings'));

		defTabOpts(s, 'common', commonConf, {optional: true});

		o = s.taboption('init', form.SectionValue, 'init', form.TypedSection, 'init', _('Startup Settings'));
		s = o.subsection;
		s.anonymous = true;
		s.dynamic = true;

		defOpts(s, startupConf);

		s = m.section(form.GridSection, 'conf', _('Proxy Settings'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;
		s.addbtntitle = _('Add new proxy...');

		s.filter = function(s) { return s !== 'common'; };

		s.tab('general', _('General Settings'));
		s.tab('http', _('HTTP Settings'));
		s.tab('plugin', _('Plugin Settings'));

		s.option(form.Value, 'name', _('Proxy name')).modalonly = false;
		s.option(form.Value, 'type', _('Proxy type')).modalonly = false;
		s.option(form.Value, 'local_ip', _('Local IP')).modalonly = false;
		s.option(form.Value, 'local_port', _('Local port')).modalonly = false;
		o = s.option(form.Value, 'remote_port', _('Remote port'));
		o.modalonly = false;
		o.depends('type', 'tcp');
		o.depends('type', 'udp');
		o.cfgvalue = function() {
			var v = this.super('cfgvalue', arguments);
			return v&&v!='0'?v:'#';
		};

		defTabOpts(s, 'general', baseProxyConf, {modalonly: true});

		// TCP and UDP
		defTabOpts(s, 'general', bindInfoConf, {optional: true, modalonly: true, depends: [{type: 'tcp'}, {type: 'udp'}]});

		// HTTP and HTTPS
		defTabOpts(s, 'http', domainConf, {optional: true, modalonly: true, depends: [{type: 'http'}, {type: 'https'}]});

		// HTTP
		defTabOpts(s, 'http', httpProxyConf, {optional: true, modalonly: true, depends: {type: 'http'}});

		// STCP and XTCP
		defTabOpts(s, 'general', stcpProxyConf, {modalonly: true, depends: [{type: 'stcp'}, {type: 'xtcp'}]});

		// Plugin
		defTabOpts(s, 'plugin', pluginConf, {modalonly: true});

		return m.render();
	}
});
