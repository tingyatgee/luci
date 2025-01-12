'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require validation';
'require tools.widgets as widgets';

function writePeriod(section_id, value) {
	var interval = this.map.lookupOption('_interval', section_id)[0],
	    period = this.map.lookupOption('_period', section_id)[0],
	    date = this.map.lookupOption('_date', section_id)[0],
	    days = this.map.lookupOption('_days', section_id)[0];

	if (period.formvalue(section_id) == 'relative') {
		uci.set('nlbwmon', section_id, 'database_interval', interval.formvalue(section_id));
	}
	else {
		uci.set('nlbwmon', section_id, 'database_interval', '%s/%s'.format(
			date.formvalue(section_id),
			days.formvalue(section_id)
		));
	}
}

function writeNetworks(section_id, value) {
	var oldval = L.toArray(uci.get('nlbwmon', section_id, 'local_network')),
	    subnets = this.map.lookupOption('_subnets', section_id)[0],
	    ifaces = this.map.lookupOption('_ifaces', section_id)[0];

	var newval = [].concat(
		L.toArray(subnets.formvalue(section_id)),
		L.toArray(ifaces.formvalue(section_id))
	);

	if (oldval.length != newval.length || oldval.join(' ') != newval.join(' '))
		uci.set('nlbwmon', section_id, 'local_network', newval);
}

function writeProtocols(section_id, value) {
	return fs.write('/usr/share/nlbwmon/protocols', (value || '').trim().replace(/\r\n/g, '\n') + '\n');
}

return view.extend({
	load: function() {
		return uci.load('nlbwmon');
	},

	render: function() {
		let m, s, o;

		m = new form.Map('nlbwmon', _('Netlink Bandwidth Monitor - Configuration'));

		s = m.section(form.TypedSection, 'nlbwmon');
		s.anonymous = true;
		s.addremove = false;

		s.tab('general', _('General Settings'));
		s.tab('advanced', _('Advanced Settings'));
		s.tab('protocol', _('Protocol Mapping'));

		o = s.taboption('general', form.ListValue, '_period', _('Accounting period'));
		o.cfgvalue = function(section_id) {
			var value = uci.get('nlbwmon', section_id, 'database_interval'),
			    m = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\/[0-9]+$/.test(value);

			return m ? 'absolute' : 'relative';
		};
		o.write = writePeriod;
		o.value('relative', _('Day of month'));
		o.value('absolute', _('Fixed interval'));

		o = s.taboption('general', form.DummyValue, '_warning', _('Warning'));
		o.default = _('Changing the accounting interval type will invalidate existing databases!<br /><strong><a href="%s">Download backup</a></strong>.').format(L.url('admin/services/nlbw/backup'));
		o.rawhtml = true;
		if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}\/[0-9]+$/.test(uci.get_first('nlbwmon', 'nlbwmon', 'database_interval')))
			o.depends('_period', 'relative');
		else
			o.depends('_period', 'absolute');

		o = s.taboption('general', form.Value, '_interval', _('Due date'));
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			var value = +uci.get('nlbwmon', section_id, 'database_interval');
			return !isNaN(value) ? value.toString() : null;
		};
		o.write = writePeriod;
		o.depends('_period', 'relative');
		o.value('1', _('1 - Restart every 1st of month'));
		o.value('-1', _('-1 - Restart every last day of month'));
		o.value('-7', _('-7 - Restart a week before end of month'));

		o = s.taboption('general', form.Value, '_date', _('Start date'));
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			var value = uci.get('nlbwmon', section_id, 'database_interval'),
			    m = /^([0-9]{4}-[0-9]{2}-[0-9]{2})\/[0-9]+$/.exec(value);

			return m ? m[1] : null;
		};
		o.validate = function(section_id, value) {
			return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.exec(value) ? true : _('Require a valid date in the form "YYYY-MM-DD"');
		};
		o.write = writePeriod;
		o.depends('_period', 'absolute');

		o = s.taboption('general', form.Value, '_days', _('Interval'));
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			var value = uci.get('nlbwmon', section_id, 'database_interval'),
			    m = /^[0-9]{4}-[0-9]{2}-[0-9]{2}\/([0-9]+)$/.exec(value);

			return m ? m[1] : null;
		};
		o.write = writePeriod;
		o.depends('_period', 'absolute');

		o = s.taboption('general', widgets.NetworkSelect, '_ifaces', _('Local interfaces'));
		o.nocreate = true;
		o.multiple = true;
		o.cfgvalue = function(section_id) {
			return L.toArray(uci.get('nlbwmon', section_id, 'local_network'));
		};
		o.write = writeNetworks;

		o = s.taboption('general', form.DynamicList, '_subnets', _('Local subnets'));
		o.cfgvalue = function(section_id) {
			return L.toArray(uci.get('nlbwmon', section_id, 'local_network')).filter(function(addr) {
				var m = /^([0-9a-fA-F:.]+)(?:\/[0-9a-fA-F:.]+)?$/.exec(addr);
				return m && (validation.parseIPv4(m[1]) || validation.parseIPv6(m[1]));
			});
		};
		o.write = writeNetworks;
		o.datatype = 'ipaddr';


		o = s.taboption('advanced', form.Value, 'database_limit', _('Maximum entries'));

		o = s.taboption('advanced', form.Flag, 'database_prealloc', _('Preallocate database'));
		o.depends({ 'database_limit': '0', '!reverse': 'true' });

		o = s.taboption('advanced', form.Flag, 'database_compress', _('Compress database'));

		o = s.taboption('advanced', form.Value, 'database_generations', _('Stored periods'));

		o = s.taboption('advanced', form.Value, 'commit_interval', _('Commit interval'));
		o.value('24h', _('24h - least flash wear at the expense of data loss risk'));
		o.value('12h', _('12h - compromise between risk of data loss and flash wear'));
		o.value('10m', _('10m - frequent commits at the expense of flash wear'));
		o.value('60s', _('60s - commit minutely, useful for non-flash storage'));

		o = s.taboption('advanced', form.Value, 'refresh_interval', _('Refresh interval'));
		o.value('30s', _('30s - refresh twice per minute for reasonably current stats'));
		o.value('5m', _('5m - rarely refresh to avoid frequently clearing conntrack counters'));

		o = s.taboption('advanced', form.Value, 'database_directory', _('Database directory'));


		o = s.taboption('protocol', form.TextValue, '_protocols');
		o.rows = 50;
		o.load = function(section_id) {
			return fs.trimmed('/usr/share/nlbwmon/protocols');
		};
		o.write = writeProtocols;
		o.remove = writeProtocols;

		return m.render();
	}
});
