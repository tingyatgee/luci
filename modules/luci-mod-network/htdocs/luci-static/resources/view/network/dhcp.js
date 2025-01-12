'use strict';
'require view';
'require dom';
'require poll';
'require rpc';
'require uci';
'require form';
'require network';
'require validation';
'require tools.widgets as widgets';

var callHostHints, callDUIDHints, callDHCPLeases, CBILeaseStatus, CBILease6Status;

callHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} }
});

callDUIDHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getDUIDHints',
	expect: { '': {} }
});

callDHCPLeases = rpc.declare({
	object: 'luci-rpc',
	method: 'getDHCPLeases',
	expect: { '': {} }
});

CBILeaseStatus = form.DummyValue.extend({
	renderWidget: function(section_id, option_id, cfgvalue) {
		return E([
			E('h4', _('Active DHCP Leases')),
			E('table', { 'id': 'lease_status_table', 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('Host')),
					E('th', { 'class': 'th' }, _('IPv4 address')),
					E('th', { 'class': 'th' }, _('MAC address')),
					E('th', { 'class': 'th' }, _('Lease time remaining'))
				]),
				E('tr', { 'class': 'tr placeholder' }, [
					E('td', { 'class': 'td' }, E('em', _('Collecting data...')))
				])
			])
		]);
	}
});

CBILease6Status = form.DummyValue.extend({
	renderWidget: function(section_id, option_id, cfgvalue) {
		return E([
			E('h4', _('Active DHCPv6 Leases')),
			E('table', { 'id': 'lease6_status_table', 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th' }, _('Host')),
					E('th', { 'class': 'th' }, _('IPv6 address')),
					E('th', { 'class': 'th' }, _('DUID')),
					E('th', { 'class': 'th' }, _('Lease time remaining'))
				]),
				E('tr', { 'class': 'tr placeholder' }, [
					E('td', { 'class': 'td' }, E('em', _('Collecting data...')))
				])
			])
		]);
	}
});

function calculateNetwork(addr, mask) {
	addr = validation.parseIPv4(String(addr));

	if (!isNaN(mask))
		mask = validation.parseIPv4(network.prefixToMask(+mask));
	else
		mask = validation.parseIPv4(String(mask));

	if (addr == null || mask == null)
		return null;

	return [
		[
			addr[0] & (mask[0] >>> 0 & 255),
			addr[1] & (mask[1] >>> 0 & 255),
			addr[2] & (mask[2] >>> 0 & 255),
			addr[3] & (mask[3] >>> 0 & 255)
		].join('.'),
		mask.join('.')
	];
}

function generateDnsmasqInstanceEntry(data) {
	const nameValueMap = new Map(Object.entries(data));
	let formatString = nameValueMap.get('.index') + ' (' +  _('Name') + (nameValueMap.get('.anonymous') ? ': dnsmasq[' + nameValueMap.get('.index') + ']': ': ' + nameValueMap.get('.name'));

	if (data.domain) {
		formatString += ', ' +  _('Domain')  + ': ' + data.domain;
	}
	if (data.local) {
		formatString += ', ' +  _('Local')  + ': ' + data.local;
	}
	formatString += ')';

	return [nameValueMap.get('.name'), formatString];
}

function getDHCPPools() {
	return uci.load('dhcp').then(function() {
		let sections = uci.sections('dhcp', 'dhcp'),
		    tasks = [], pools = [];

		for (var i = 0; i < sections.length; i++) {
			if (sections[i].ignore == '1' || !sections[i].interface)
				continue;

			tasks.push(network.getNetwork(sections[i].interface).then(L.bind(function(section_id, net) {
				var cidr = net ? (net.getIPAddrs()[0] || '').split('/') : null;

				if (cidr && cidr.length == 2) {
					var net_mask = calculateNetwork(cidr[0], cidr[1]);

					pools.push({
						section_id: section_id,
						network: net_mask[0],
						netmask: net_mask[1]
					});
				}
			}, null, sections[i]['.name'])));
		}

		return Promise.all(tasks).then(function() {
			return pools;
		});
	});
}

function validateHostname(sid, s) {
	if (s == null || s == '')
		return true;

	if (s.length > 256)
		return _('Expecting: %s').format(_('valid hostname'));

	var labels = s.replace(/^\*?\.?|\.$/g, '').split(/\./);

	for (var i = 0; i < labels.length; i++)
		if (!labels[i].match(/^[a-z0-9_](?:[a-z0-9-]{0,61}[a-z0-9])?$/i))
			return _('Expecting: %s').format(_('valid hostname'));

	return true;
}

function validateAddressList(sid, s) {
	if (s == null || s == '')
		return true;

	var m = s.match(/^\/(.+)\/$/),
	    names = m ? m[1].split(/\//) : [ s ];

	for (var i = 0; i < names.length; i++) {
		var res = validateHostname(sid, names[i]);

		if (res !== true)
			return res;
	}

	return true;
}

function validateServerSpec(sid, s) {
	if (s == null || s == '')
		return true;

	var m = s.match(/^(\/.*\/)?(.*)$/);
	if (!m)
		return _('Expecting: %s').format(_('valid hostname'));

	if (m[1] != '//' && m[1] != '/#/') {
		var res = validateAddressList(sid, m[1]);
		if (res !== true)
			return res;
	}

	if (m[2] == '' || m[2] == '#')
		return true;

	// ipaddr%scopeid#srvport@source@interface#srcport

	m = m[2].match(/^([0-9a-f:.]+)(?:%[^#@]+)?(?:#(\d+))?(?:@([0-9a-f:.]+)(?:@[^#]+)?(?:#(\d+))?)?$/);

	if (!m)
		return _('Expecting: %s').format(_('valid IP address'));

	if (validation.parseIPv4(m[1])) {
		if (m[3] != null && !validation.parseIPv4(m[3]))
			return _('Expecting: %s').format(_('valid IPv4 address'));
	}
	else if (validation.parseIPv6(m[1])) {
		if (m[3] != null && !validation.parseIPv6(m[3]))
			return _('Expecting: %s').format(_('valid IPv6 address'));
	}
	else {
		return _('Expecting: %s').format(_('valid IP address'));
	}

	if ((m[2] != null && +m[2] > 65535) || (m[4] != null && +m[4] > 65535))
		return _('Expecting: %s').format(_('valid port value'));

	return true;
}

function expandAndFormatMAC(macs) {
	let result = [];

	macs.forEach(mac => {
		if (isValidMAC(mac)) {
			const expandedMac = mac.split(':').map(part => {
				return (part.length === 1 && part !== '*') ? '0' + part : part;
			}).join(':').toUpperCase();
			result.push(expandedMac);
		}
	});

	return result.length ? result : null;
}

function isValidMAC(sid, s) {
	if (!s)
		return true;

	let macaddrs = L.toArray(s);

	for (var i = 0; i < macaddrs.length; i++)
		if (!macaddrs[i].match(/^(([0-9a-f]{1,2}|\*)[:-]){5}([0-9a-f]{1,2}|\*)$/i))
			return _('Expecting a valid MAC address, optionally including wildcards') + _('; invalid MAC: ') + macaddrs[i];

	return true;
}

function validateMACAddr(pools, sid, s) {
	if (s == null || s == '')
		return true;

	var leases = uci.sections('dhcp', 'host'),
	    this_macs = L.toArray(s).map(function(m) { return m.toUpperCase() });

	for (var i = 0; i < pools.length; i++) {
		var this_net_mask = calculateNetwork(this.section.formvalue(sid, 'ip'), pools[i].netmask);

		if (!this_net_mask)
			continue;

		for (var j = 0; j < leases.length; j++) {
			if (leases[j]['.name'] == sid || !leases[j].ip)
				continue;

			var lease_net_mask = calculateNetwork(leases[j].ip, pools[i].netmask);

			if (!lease_net_mask || this_net_mask[0] != lease_net_mask[0])
				continue;

			var lease_macs = L.toArray(leases[j].mac).map(function(m) { return m.toUpperCase() });

			for (var k = 0; k < lease_macs.length; k++)
				for (var l = 0; l < this_macs.length; l++)
					if (lease_macs[k] == this_macs[l])
						return _('The MAC address %h is already used by another static lease in the same DHCP pool').format(this_macs[l]);
		}
	}

	return isValidMAC(sid, s);
}

return view.extend({
	load: function() {
		return Promise.all([
			callHostHints(),
			callDUIDHints(),
			getDHCPPools(),
			network.getNetworks(),
			uci.load('firewall')
		]);
	},

	render: function(hosts_duids_pools) {
		var has_dhcpv6 = L.hasSystemFeature('dnsmasq', 'dhcpv6') || L.hasSystemFeature('odhcpd'),
		    hosts = hosts_duids_pools[0],
		    duids = hosts_duids_pools[1],
		    pools = hosts_duids_pools[2],
		    networks = hosts_duids_pools[3],
		    m, s, o, ss, so, dnss;

		let noi18nstrings = {
			etc_hosts: '<code>/etc/hosts</code>',
			etc_ethers: '<code>/etc/ethers</code>',
			localhost_v6: '<code>::1</code>',
			loopback_slash_8_v4: '<code>127.0.0.0/8</code>',
			not_found: '<code>Not found</code>',
			nxdomain: '<code>NXDOMAIN</code>',
			rfc_1918_link: '<a href="https://www.rfc-editor.org/rfc/rfc1918">RFC1918</a>',
			rfc_4193_link: '<a href="https://www.rfc-editor.org/rfc/rfc4193">RFC4193</a>',
			rfc_4291_link: '<a href="https://www.rfc-editor.org/rfc/rfc4291">RFC4291</a>',
			rfc_6303_link: '<a href="https://www.rfc-editor.org/rfc/rfc6303">RFC6303</a>',
			reverse_arpa: '<code>*.IN-ADDR.ARPA,*.IP6.ARPA</code>',
			servers_file_entry01: '<code>server=1.2.3.4</code>',
			servers_file_entry02: '<code>server=/domain/1.2.3.4</code>',

		};

		const recordtypes = [
			'ANY',
			'A',
			'AAAA',
			'ALIAS',
			'CAA',
			'CERT',
			'CNAME',
			'DS',
			'HINFO',
			'HIP',
			'HTTPS',
			'KEY',
			'LOC',
			'MX',
			'NAPTR',
			'NS',
			'OPENPGPKEY',
			'PTR',
			'RP',
			'SIG',
			'SOA',
			'SRV',
			'SSHFP',
			'SVCB',
			'TLSA',
			'TXT',
			'URI',
		]

		function customi18n(template, values) {
			if (!values)
				values = noi18nstrings;
			return template.replace(/\{(\w+)\}/g, (match, key) => values[key] || match);
		};

		m = new form.Map('dhcp', _('DHCP and DNS'));

		s = m.section(form.TypedSection, 'dnsmasq');
		s.anonymous = false;
		s.addremove = true;
		s.addbtntitle = _('Add server instance', 'Dnsmasq instance');

		s.renderContents = function(/* ... */) {
			var renderTask = form.TypedSection.prototype.renderContents.apply(this, arguments),
			    sections = this.cfgsections();

			return Promise.resolve(renderTask).then(function(nodes) {
				if (sections.length < 2) {
					nodes.querySelector('#cbi-dhcp-dnsmasq > h3').remove();
					nodes.querySelector('#cbi-dhcp-dnsmasq > .cbi-section-remove').remove();
				}
				else {
					nodes.querySelectorAll('#cbi-dhcp-dnsmasq > .cbi-section-remove').forEach(function(div, i) {
						var section = uci.get('dhcp', sections[i]),
						    hline = div.nextElementSibling,
						    btn = div.firstElementChild;

						if (!section || section['.anonymous']) {
							hline.innerText = i ? _('Unnamed instance #%d', 'Dnsmasq instance').format(i+1) : _('Default instance', 'Dnsmasq instance');
							btn.innerText = i ? _('Remove instance #%d', 'Dnsmasq instance').format(i+1) : _('Remove default instance', 'Dnsmasq instance');
						}
						else {
							hline.innerText = _('Instance "%q"', 'Dnsmasq instance').format(section['.name']);
							btn.innerText = _('Remove instance "%q"', 'Dnsmasq instance').format(section['.name']);
						}
					});
				}

				nodes.querySelector('#cbi-dhcp-dnsmasq > .cbi-section-create input').placeholder = _('New instance name…', 'Dnsmasq instance');

				return nodes;
			});
		};


		s.tab('general', _('General'));
		s.tab('cache', _('Cache'));
		s.tab('devices', _('Devices &amp; Ports'));
		s.tab('dnsrecords', _('DNS Records'));
		s.tab('dnssecopt', _('DNSSEC'));
		s.tab('filteropts', _('Filter'));
		s.tab('forward', _('Forwards'));
		s.tab('limits', _('Limits'));
		s.tab('logging', _('Log'));
		s.tab('files', _('Resolv &amp; Hosts Files'));
		s.tab('leases', _('Static Leases'));
		s.tab('ipsets', _('IP Sets'));
		s.tab('relay', _('Relay'));
		s.tab('pxe_tftp', _('PXE/TFTP'));

		o = s.taboption('cache', form.MultiValue, 'cache_rr',
			_('Cache arbitrary RR'));
		o.optional = true;
		o.create = true;
		o.multiple = true;
		o.display_size = 5;
		recordtypes.forEach(r => {
			o.value(r);
		});

		s.taboption('filteropts', form.Flag, 'domainneeded',
			_('Domain required'));
		
		s.taboption('general', form.Flag, 'authoritative',
			_('Authoritative'));

		o = s.taboption('general', form.Value, 'local',
			_('Resolve these locally'));
		o.placeholder = '/internal.example.com/private.example.com/example.org';

		s.taboption('general', form.Value, 'domain',
			_('Local domain'));

		o = s.taboption('logging', form.Flag, 'logqueries',
			_('Log queries'));
		o.optional = true;

		o = s.taboption('logging', form.Flag, 'logdhcp',
			_('Extra DHCP logging'));
		o.optional = true;

		o = s.taboption('logging', form.Value, 'logfacility',
			_('Log facility'));
		o.optional = true;
		o.value('KERN');
		o.value('USER');
		o.value('MAIL');
		o.value('DAEMON');
		o.value('AUTH');
		o.value('LPR');
		o.value('NEWS');
		o.value('UUCP');
		o.value('CRON');
		o.value('LOCAL0');
		o.value('LOCAL1');
		o.value('LOCAL2');
		o.value('LOCAL3');
		o.value('LOCAL4');
		o.value('LOCAL5');
		o.value('LOCAL6');
		o.value('LOCAL7');
		o.value('-', _('stderr'));

		o = s.taboption('forward', form.DynamicList, 'server',
			_('DNS Forwards'));
		o.optional = true;
		o.placeholder = '/*.example.org/10.1.2.3';
		o.validate = validateServerSpec;

		o = s.taboption('general', form.DynamicList, 'address',
			_('Addresses'));
		o.optional = true;
		o.placeholder = '/router.local/router.lan/192.168.0.1';

		o = s.taboption('general', form.DynamicList, 'ipset',
			_('IP sets'));
		o.optional = true;
		o.placeholder = '/example.org/ipset,ipset6';

		o = s.taboption('filteropts', form.Flag, 'rebind_protection',
			_('Rebind protection'));
		o.rmempty = false;

		o = s.taboption('filteropts', form.Flag, 'rebind_localhost',
			_('Allow localhost'));
		o.depends('rebind_protection', '1');

		o = s.taboption('filteropts', form.DynamicList, 'rebind_domain',
			_('Domain whitelist'));
		o.depends('rebind_protection', '1');
		o.optional = true;
		o.placeholder = 'ihost.netflix.com';
		o.validate = validateAddressList;

		o = s.taboption('filteropts', form.Flag, 'localservice',
			_('Local service only'));
		o.optional = false;
		o.rmempty = false;

		o = s.taboption('devices', form.Flag, 'nonwildcard',
			_('Non-wildcard'));
		o.default = o.enabled;
		o.optional = false;
		o.rmempty = true;

		o = s.taboption('devices', widgets.NetworkSelect, 'interface',
			_('Listen interfaces'));
		o.multiple = true;
		o.nocreate = true;

		o = s.taboption('devices', widgets.NetworkSelect, 'notinterface',
			_('Exclude interfaces'));
		o.loopback = true;
		o.multiple = true;
		o.nocreate = true;

		o = s.taboption('relay', form.SectionValue, '__relays__', form.TableSection, 'relay', null);

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable  = true;
		ss.rowcolors = true;
		ss.nodescriptions = true;

		so = ss.option(form.Value, 'local_addr', _('Relay from'));
		so.rmempty = false;
		so.datatype = 'ipaddr';

		for (var family = 4; family <= 6; family += 2) {
			for (var i = 0; i < networks.length; i++) {
				if (networks[i].getName() != 'loopback') {
					var addrs = (family == 6) ? networks[i].getIP6Addrs() : networks[i].getIPAddrs();
					for (var j = 0; j < addrs.length; j++) {
						var addr = addrs[j].split('/')[0];
						so.value(addr, E([], [
							addr, ' (',
							widgets.NetworkSelect.prototype.renderIfaceBadge(networks[i]),
							')'
						]));
					}
				}
			}
		}

		so = ss.option(form.Value, 'server_addr', _('Relay to address'));
		so.rmempty = false;
		so.optional = false;
		so.placeholder = '192.168.10.1#535';

		so.validate = function(section, value) {
			var m = this.section.formvalue(section, 'local_addr'),
			    n = this.section.formvalue(section, 'server_addr'),
			    p;

			if (!m || !n) {
				return _('Both "Relay from" and "Relay to address" must be specified.');
			}
			else {
				p = n.split('#');
				if (p.length > 1 && !/^[0-9]+$/.test(p[1]))
					return _('Expected port number.');
				else
					n = p[0];

				if ((validation.parseIPv6(m) && validation.parseIPv6(n)) ||
					validation.parseIPv4(m) && validation.parseIPv4(n))
					return true;
				else
					return _('Address families of "Relay from" and "Relay to address" must match.')
			}
			return true;
		};


		so = ss.option(widgets.NetworkSelect, 'interface', _('Only accept replies via'));
		so.optional = true;
		so.rmempty = false;
		so.placeholder = 'lan';

		s.taboption('files', form.Flag, 'readethers',
			customi18n(_('Use {etc_ethers}') ));

		s.taboption('files', form.Value, 'leasefile',
			_('Lease file'));

		o = s.taboption('files', form.Flag, 'noresolv',
			_('Ignore resolv file'));
		o.optional = true;

		o = s.taboption('files', form.Value, 'resolvfile',
			_('Resolv file'));
		o.depends('noresolv', '0');
		o.placeholder = '/tmp/resolv.conf.d/resolv.conf.auto';
		o.optional = true;

		o = s.taboption('files', form.Flag, 'strictorder',
			_('Strict order'));
		o.optional = true;

		o = s.taboption('files', form.Flag, 'ignore_hosts_dir',
			_('Ignore hosts files directory'));
		o.optional = true;

		o = s.taboption('files', form.Flag, 'nohosts',
			customi18n(_('Ignore {etc_hosts} file') )
		);
		o.optional = true;

		o = s.taboption('files', form.DynamicList, 'addnhosts',
			_('Additional hosts files'));
		o.optional = true;
		o.placeholder = '/etc/dnsmasq.hosts';

		o = s.taboption('logging', form.Flag, 'quietdhcp',
			_('Suppress logging'));
		o.optional = true;
		o.depends('logdhcp', '0');

		o = s.taboption('general', form.Flag, 'sequential_ip',
			_('Allocate IPs sequentially'));
		o.optional = true;

		o = s.taboption('filteropts', form.Flag, 'boguspriv',
			_('Filter private')); 
		o.default = o.enabled;

		s.taboption('filteropts', form.Flag, 'filterwin2k',
			_('Filter SRV/SOA'));

		o = s.taboption('filteropts', form.Flag, 'filter_aaaa',
			_('Filter IPv6 AAAA records'));
		o.optional = true;

		o = s.taboption('filteropts', form.Flag, 'filter_a',
			_('Filter IPv4 A records'));
		o.optional = true;

		o = s.taboption('filteropts', form.MultiValue, 'filter_rr',
			_('Filter arbitrary RR'));
		o.optional = true;
		o.create = true;
		o.multiple = true;
		o.display_size = 5;
		recordtypes.forEach(r => {
			o.value(r);
		});

		s.taboption('filteropts', form.Flag, 'localise_queries',
			_('Localise queries'));

		if (L.hasSystemFeature('dnsmasq', 'dnssec')) {
			o = s.taboption('dnssecopt', form.Flag, 'dnssec',
				_('DNSSEC'));
			o.optional = true;

			o = s.taboption('dnssecopt', form.Flag, 'dnsseccheckunsigned',
				_('DNSSEC check unsigned'));
			o.default = o.enabled;
			o.optional = true;
		}

		s.taboption('filteropts', form.Flag, 'nonegcache',
			_('No negative cache'));

		o = s.taboption('forward', form.Value, 'serversfile',
			_('Additional servers file'));
		o.placeholder = '/etc/dnsmasq.servers';

		o = s.taboption('forward', form.Value, 'addmac',
			_('Add requestor MAC'));
		o.optional = true;
		o.value('', _('off'));
		o.value('1', _('enabled (default)'));
		o.value('base64');
		o.value('text');

		s.taboption('forward', form.Flag, 'stripmac',
			_('Remove MAC address before forwarding query'));

		o = s.taboption('forward', form.Value, 'addsubnet',
			_('Add subnet address to forwards'));
		o.optional = true;

		s.taboption('forward', form.Flag, 'stripsubnet',
			_('Remove subnet address before forwarding query'));

		o = s.taboption('general', form.Flag, 'allservers',
			_('All servers'));
		o.optional = true;

		o = s.taboption('filteropts', form.DynamicList, 'bogusnxdomain',
			customi18n(_('IPs to override with {nxdomain}') ));
		o.optional = true;
		o.placeholder = '64.94.110.11';

		o = s.taboption('devices', form.Value, 'port',
			_('DNS server port'));
		o.optional = true;
		o.datatype = 'port';
		o.placeholder = 53;

		o = s.taboption('devices', form.Value, 'queryport',
			_('DNS query port'));
		o.optional = true;
		o.datatype = 'port';
		o.placeholder = _('any');

		o = s.taboption('devices', form.Value, 'minport',
			_('Minimum source port #'));
		o.optional = true;
		o.datatype = 'port';
		o.placeholder = 1024;
		o.depends('queryport', '');

		o = s.taboption('devices', form.Value, 'maxport',
			_('Maximum source port #'));
		o.optional = true;
		o.datatype = 'port';
		o.placeholder = 50000;
		o.depends('queryport', '');

		o = s.taboption('limits', form.Value, 'dhcpleasemax',
			_('Max. DHCP leases'));
		o.optional = true;
		o.datatype = 'uinteger';
		o.placeholder = 150;

		o = s.taboption('limits', form.Value, 'ednspacket_max',
			_('Max. EDNS0 packet size'));
		o.optional = true;
		o.datatype = 'uinteger';
		o.placeholder = 1280;

		o = s.taboption('limits', form.Value, 'dnsforwardmax',
			_('Max. concurrent queries'));
		o.optional = true;
		o.datatype = 'uinteger';
		o.placeholder = 150;

		o = s.taboption('limits', form.Value, 'cachesize',
			_('Size of DNS query cache'));
		o.optional = true;
		o.datatype = 'range(0,10000)';
		o.placeholder = 1000;

		o = s.taboption('limits', form.Value, 'min_cache_ttl',
			_('Min cache TTL'));
		o.optional = true;
		o.placeholder = 60;

		o = s.taboption('limits', form.Value, 'max_cache_ttl',
			_('Max cache TTL'));
		o.optional = true;
		o.placeholder = 3600;

		o = s.taboption('pxe_tftp', form.Flag, 'enable_tftp',
			_('Enable TFTP server'));
		o.optional = true;

		o = s.taboption('pxe_tftp', form.Value, 'tftp_root',
			_('TFTP server root'));
		o.depends('enable_tftp', '1');
		o.optional = true;
		o.placeholder = '/';

		o = s.taboption('pxe_tftp', form.Value, 'dhcp_boot',
			_('Network boot image'));
		o.depends('enable_tftp', '1');
		o.optional = true;
		o.placeholder = 'pxelinux.0';

		/* PXE - https://openwrt.org/docs/guide-user/base-system/dhcp#booting_options */
		o = s.taboption('pxe_tftp', form.SectionValue, '__pxe__', form.GridSection, 'boot', null);
		ss = o.subsection;
		ss.addremove = true;
		ss.anonymous = true;
		ss.modaltitle = _('Edit PXE/TFTP/BOOTP Host');
		ss.nodescriptions = true;

		so = ss.option(form.Value, 'filename',
			_('Filename'));
		so.optional = false;
		so.placeholder = 'pxelinux.0';

		so = ss.option(form.Value, 'servername',
			_('Server name'));
		so.optional = false;
		so.placeholder = 'myNAS';

		so = ss.option(form.Value, 'serveraddress',
			_('Server address'));
		so.optional = false;
		so.placeholder = '192.168.1.2';

		so = ss.option(form.DynamicList, 'dhcp_option',
			_('DHCP Options'));
		so.optional = true;
		so.placeholder = 'option:root-path,192.168.1.2:/data/netboot/root';

		so = ss.option(form.Value, 'networkid',
			_('Match this Tag'));
		so.optional = true;
		so.noaliases = true;

		so = ss.option(form.Flag, 'force',
			_('Force'));
		so.optional = true;

		so = ss.option(form.Value, 'instance',
			_('Instance'));
		so.optional = true;

		Object.values(L.uci.sections('dhcp', 'dnsmasq')).forEach(function(val, index) {
			var [name, display_str] = generateDnsmasqInstanceEntry(val);
			so.value(name, display_str);
		});

		o = s.taboption('dnsrecords', form.SectionValue, '__dnsrecords__', form.TypedSection, '__dnsrecords__');

		dnss = o.subsection;

		dnss.anonymous = true;
		dnss.cfgsections = function() { return [ '__dnsrecords__' ] };

		dnss.tab('hosts', _('Hostnames'));
		dnss.tab('srvhosts', _('SRV'));
		dnss.tab('mxhosts', _('MX'));
		dnss.tab('cnamehosts', _('CNAME'));
		dnss.tab('dnsrr', _('DNS-RR'));

		o = dnss.taboption('srvhosts', form.SectionValue, '__srvhosts__', form.TableSection, 'srvhost', null);

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable  = true;
		ss.rowcolors = true;

		so = ss.option(form.Value, 'srv', _('SRV'));
		so.rmempty = false;
		so.datatype = 'hostname';
		so.placeholder = '_sip._tcp.example.com.';

		so = ss.option(form.Value, 'target', _('Target'));
		so.rmempty = false;
		so.datatype = 'hostname';
		so.placeholder = 'sip.example.com.';

		so = ss.option(form.Value, 'port', _('Port'));
		so.rmempty = false;
		so.datatype = 'port';
		so.placeholder = '5060';

		so = ss.option(form.Value, 'class', _('Priority'));
		so.rmempty = true;
		so.datatype = 'range(0,65535)';
		so.placeholder = '10';

		so = ss.option(form.Value, 'weight', _('Weight'));
		so.rmempty = true;
		so.datatype = 'range(0,65535)';
		so.placeholder = '50';

		o = dnss.taboption('mxhosts', form.SectionValue, '__mxhosts__', form.TableSection, 'mxhost', null);

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable  = true;
		ss.rowcolors = true;
		ss.nodescriptions = true;

		so = ss.option(form.Value, 'domain', _('Domain'));
		so.rmempty = false;
		so.datatype = 'hostname';
		so.placeholder = 'example.com.';

		so = ss.option(form.Value, 'relay', _('Relay'));
		so.rmempty = false;
		so.datatype = 'hostname';
		so.placeholder = 'relay.example.com.';

		so = ss.option(form.Value, 'pref', _('Priority'));
		so.rmempty = true;
		so.datatype = 'range(0,65535)';
		so.placeholder = '0';

		o = dnss.taboption('cnamehosts', form.SectionValue, '__cname__', form.TableSection, 'cname', null);

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable  = true;
		ss.rowcolors = true;
		ss.nodescriptions = true;

		so = ss.option(form.Value, 'cname', _('Domain'));
		so.rmempty = false;
		so.validate = validateHostname;
		so.placeholder = 'www.example.com.';

		so = ss.option(form.Value, 'target', _('Target'));
		so.rmempty = false;
		so.datatype = 'hostname';
		so.placeholder = 'example.com.';

		o = dnss.taboption('hosts', form.SectionValue, '__hosts__', form.GridSection, 'domain', null);

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable  = true;

		so = ss.option(form.Value, 'name', _('Hostname'));
		so.rmempty = false;
		so.datatype = 'hostname';

		so = ss.option(form.Value, 'ip', _('IP address'));
		so.rmempty = false;
		so.datatype = 'ipaddr("nomask")';

		var ipaddrs = {};

		Object.keys(hosts).forEach(function(mac) {
			var addrs = L.toArray(hosts[mac].ipaddrs || hosts[mac].ipv4);

			for (var i = 0; i < addrs.length; i++)
				ipaddrs[addrs[i]] = hosts[mac].name || mac;
		});

		L.sortedKeys(ipaddrs, null, 'addr').forEach(function(ipv4) {
			so.value(ipv4, '%s (%s)'.format(ipv4, ipaddrs[ipv4]));
		});

		o = dnss.taboption('dnsrr', form.SectionValue, '__dnsrr__', form.TableSection, 'dnsrr', null);

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable  = true;
		ss.rowcolors = true;
		ss.nodescriptions = true;

		function hexdecodeload(section_id) {
			let value = uci.get('dhcp', section_id, this.option) || '';
			// Remove any spaces or colons from the hex string - they're allowed
			value = value.replace(/[\s:]/g, '');
			// Hex-decode the string before displaying
			let decodedString = '';
			for (let i = 0; i < value.length; i += 2) {
				decodedString += String.fromCharCode(parseInt(value.substr(i, 2), 16));
			}
			return decodedString;
		}

		function hexencodesave(section, value) {
			if (!value || value.length === 0) {
				uci.unset('dhcp', section, 'hexdata');
				return;
			}
			// Hex-encode the string before saving
			const encodedArr = value.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
			uci.set('dhcp', section, this.option, encodedArr);
		}

		so = ss.option(form.Value, 'dnsrr', _('Resource Record Name'));
		so.rmempty = false;
		so.datatype = 'hostname';
		so.placeholder = 'svcb.example.com.';

		so = ss.option(form.Value, 'rrnumber', _('Resource Record Number'));
		so.rmempty = false;
		so.datatype = 'uinteger';
		so.placeholder = '64';

		so = ss.option(form.Value, 'hexdata', _('Raw Data'));
		so.rmempty = true;
		so.datatype = 'string';
		so.placeholder = 'free-form string';
		so.load = hexdecodeload;
		so.write = hexencodesave;

		so = ss.option(form.DummyValue, '_hexdata', _('Hex Data'));
		so.width = '15%';
		so.rawhtml = true;
		so.load = function(section_id) {
			let hexdata = uci.get('dhcp', section_id, 'hexdata') || '';
			hexdata = hexdata.replace(/[:]/g, '');
			if (hexdata) {
				return hexdata.replace(/(.{20})/g, '$1<br/>'); // Inserts <br> after every 2 characters (hex pair)
			} else {
				return '';
			}
		}

		o = s.taboption('ipsets', form.SectionValue, '__ipsets__', form.GridSection, 'ipset', null);

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable  = true;
		ss.rowcolors = true;
		ss.nodescriptions = true;
		ss.modaltitle = _('Edit IP set');

		so = ss.option(form.DynamicList, 'name', _('Name of the set'));
		uci.sections('firewall', 'ipset', function(s) {
			if (typeof(s.name) == 'string')
				so.value(s.name, s.comment ? '%s (%s)'.format(s.name, s.comment) : s.name);
		});
		so.rmempty = false;
		so.editable = false;
		so.datatype = 'string';

		so = ss.option(form.DynamicList, 'domain', _('FQDN'));
		so.rmempty = false;
		so.editable = false;
		so.datatype = 'hostname';

		so = ss.option(form.Value, 'table', _('Netfilter table name'));
		so.editable = false;
		so.placeholder = 'fw4';
		so.rmempty = true;

		so = ss.option(form.ListValue, 'table_family', _('Table IP family'));
		so.editable = false;
		so.rmempty = true;
		so.value('inet', _('IPv4+6'));
		so.value('ip', _('IPv4'));
		so.value('ip6', _('IPv6'));

		o = s.taboption('leases', form.SectionValue, '__leases__', form.GridSection, 'host', null);

		ss = o.subsection;

		ss.addremove = true;
		ss.anonymous = true;
		ss.sortable = true;
		ss.nodescriptions = true;
		ss.max_cols = 8;
		ss.modaltitle = _('Edit static lease');

		so = ss.option(form.Value, 'name', 
			_('Hostname'));
		so.validate = validateHostname;
		so.rmempty  = true;
		so.write = function(section, value) {
			uci.set('dhcp', section, 'name', value);
			uci.set('dhcp', section, 'dns', '1');
		};
		so.remove = function(section) {
			uci.unset('dhcp', section, 'name');
			uci.unset('dhcp', section, 'dns');
		};

		//this can be a .DynamicList or a .Value with a widget and dnsmasq handles multimac OK.
		so = ss.option(form.DynamicList, 'mac',
			_('MAC address(es)'));
		//As a special case, in DHCPv4, it is possible to include more than one hardware address. eg: --dhcp-host=11:22:33:44:55:66,12:34:56:78:90:12,192.168.0.2 This allows an IP address to be associated with multiple hardware addresses, and gives dnsmasq permission to abandon a DHCP lease to one of the hardware addresses when another one asks for a lease
		so.rmempty  = true;
		so.cfgvalue = function(section) {
			var macs = uci.get('dhcp', section, 'mac');
			if(!Array.isArray(macs)){
				return expandAndFormatMAC(L.toArray(macs));
			} else {
				return expandAndFormatMAC(macs);
			}
		};
		//removed jows renderwidget function which hindered multi-mac entry
		so.validate = validateMACAddr.bind(so, pools);
		Object.keys(hosts).forEach(function(mac) {
			var hint = hosts[mac].name || L.toArray(hosts[mac].ipaddrs || hosts[mac].ipv4)[0];
			so.value(mac, hint ? '%s (%s)'.format(mac, hint) : mac);
		});

		so = ss.option(form.Value, 'ip', _('IPv4 address'));
		so.value('ignore', _('Ignore'));
		so.datatype = 'or(ip4addr,"ignore")';
		so.validate = function(section, value) {
			var m = this.section.formvalue(section, 'mac'),
			    n = this.section.formvalue(section, 'name');

			if ((m && !m.length > 0) && !n)
				return _('One of hostname or MAC address must be specified!');

			if (!value || value == 'ignore')
				return true;

			var leases = uci.sections('dhcp', 'host');

			for (var i = 0; i < leases.length; i++)
				if (leases[i]['.name'] != section && leases[i].ip == value)
					return _('The IP address %h is already used by another static lease').format(value);

			for (var i = 0; i < pools.length; i++) {
				var net_mask = calculateNetwork(value, pools[i].netmask);

				if (net_mask && net_mask[0] == pools[i].network)
					return true;
			}

			return _('The IP address is outside of any DHCP pool address range');
		};

		L.sortedKeys(ipaddrs, null, 'addr').forEach(function(ipv4) {
			so.value(ipv4, ipaddrs[ipv4] ? '%s (%s)'.format(ipv4, ipaddrs[ipv4]) : ipv4);
		});

		so = ss.option(form.Value, 'leasetime', 
			_('Lease time'));
		so.rmempty = true;
		so.value('5m', _('5m (5 minutes)'));
		so.value('3h', _('3h (3 hours)'));
		so.value('12h', _('12h (12 hours - default)'));
		so.value('7d', _('7d (7 days)'));
		so.value('infinite', _('infinite (lease does not expire)'));

		so = ss.option(form.Value, 'duid',
			_('DUID'));
		so.datatype = 'and(rangelength(20,36),hexstring)';
		Object.keys(duids).forEach(function(duid) {
			so.value(duid, '%s (%s)'.format(duid, duids[duid].hostname || duids[duid].macaddr || duids[duid].ip6addr || '?'));
		});

		so = ss.option(form.Value, 'hostid',
			_('IPv6-Suffix (hex)'));
		so.datatype = 'and(rangelength(0,16),hexstring)';

		so = ss.option(form.DynamicList, 'tag',
			_('Tag'));

		so = ss.option(form.DynamicList, 'match_tag',
			_('Match Tag'));
		so.value('known', _('known'));
		so.value('!known', _('!known (not known)'));
		so.value('known-othernet', _('known-othernet (on different subnet)'));
		so.optional = true;

		so = ss.option(form.Value, 'instance',
			_('Instance'));
		so.optional = true;

		Object.values(L.uci.sections('dhcp', 'dnsmasq')).forEach(function(val, index) {
			var [name, display_str] = generateDnsmasqInstanceEntry(val);
			so.value(name, display_str);
		});


		so = ss.option(form.Flag, 'broadcast',
			_('Broadcast'));

		so = ss.option(form.Flag, 'dns',
			_('Forward/reverse DNS'));

		o = s.taboption('leases', CBILeaseStatus, '__status__');

		if (has_dhcpv6)
			o = s.taboption('leases', CBILease6Status, '__status6__');

		return m.render().then(function(mapEl) {
			poll.add(function() {
				return callDHCPLeases().then(function(leaseinfo) {
					var leases = Array.isArray(leaseinfo.dhcp_leases) ? leaseinfo.dhcp_leases : [],
					    leases6 = Array.isArray(leaseinfo.dhcp6_leases) ? leaseinfo.dhcp6_leases : [];

					cbi_update_table(mapEl.querySelector('#lease_status_table'),
						leases.map(function(lease) {
							var exp;

							if (lease.expires === false)
								exp = E('em', _('unlimited'));
							else if (lease.expires <= 0)
								exp = E('em', _('expired'));
							else
								exp = '%t'.format(lease.expires);

							var hint = lease.macaddr ? hosts[lease.macaddr] : null,
							    name = hint ? hint.name : null,
							    host = null;

							if (name && lease.hostname && lease.hostname != name)
								host = '%s (%s)'.format(lease.hostname, name);
							else if (lease.hostname)
								host = lease.hostname;

							return [
								host || '-',
								lease.ipaddr,
								lease.macaddr,
								exp
							];
						}),
						E('em', _('There are no active leases')));

					if (has_dhcpv6) {
						cbi_update_table(mapEl.querySelector('#lease6_status_table'),
							leases6.map(function(lease) {
								var exp;

								if (lease.expires === false)
									exp = E('em', _('unlimited'));
								else if (lease.expires <= 0)
									exp = E('em', _('expired'));
								else
									exp = '%t'.format(lease.expires);

								var hint = lease.macaddr ? hosts[lease.macaddr] : null,
								    name = hint ? (hint.name || L.toArray(hint.ipaddrs || hint.ipv4)[0] || L.toArray(hint.ip6addrs || hint.ipv6)[0]) : null,
								    host = null;

								if (name && lease.hostname && lease.hostname != name && lease.ip6addr != name)
									host = '%s (%s)'.format(lease.hostname, name);
								else if (lease.hostname)
									host = lease.hostname;
								else if (name)
									host = name;

								return [
									host || '-',
									lease.ip6addrs ? lease.ip6addrs.join('<br />') : lease.ip6addr,
									lease.duid,
									exp
								];
							}),
							E('em', _('There are no active leases')));
					}
				});
			});

			return mapEl;
		});
	}
});
