import { describe, expect, it } from 'vitest';
import { parseOptions } from '../src/config.js';

describe('parseOptions', () => {
  it('uses defaults for an empty object', () => {
    const o = parseOptions({});
    expect(o.users).toEqual([]);
    expect(o.dashboardPath).toBe('/lovelace/0');
    expect(o.dailySummaryTime).toBe('08:00');
    expect(o.overdueNagTime).toBe('18:00');
    expect(o.logLevel).toBe('info');
  });

  it('maps users and notify services', () => {
    const o = parseOptions({
      users: [
        { name: 'Rene', notify: ['mobile_app_iphone_von_rene_2'] },
        { name: 'Conny', notify: ['mobile_app_connys_iphone_2', 'mobile_app_ipad'] },
      ],
      dashboard_path: '/dashboard-handy/start',
    });
    expect(o.users).toHaveLength(2);
    expect(o.users[1]).toEqual({
      name: 'Conny',
      notify: ['mobile_app_connys_iphone_2', 'mobile_app_ipad'],
    });
    expect(o.dashboardPath).toBe('/dashboard-handy/start');
  });

  it('strips a leading notify. prefix from service names', () => {
    const o = parseOptions({ users: [{ name: 'Rene', notify: ['notify.mobile_app_x'] }] });
    expect(o.users[0]?.notify).toEqual(['mobile_app_x']);
  });

  it('tolerates a missing notify list', () => {
    const o = parseOptions({ users: [{ name: 'Rene' }] });
    expect(o.users[0]?.notify).toEqual([]);
  });

  it('rejects an invalid time', () => {
    expect(() => parseOptions({ daily_summary_time: '25:99' })).toThrow(/daily_summary_time/);
  });

  it('ensures the dashboard path starts with a slash', () => {
    expect(parseOptions({ dashboard_path: 'lovelace/0' }).dashboardPath).toBe('/lovelace/0');
  });

  it('access_mode: selected ist die Vorgabe, everyone wird erkannt', () => {
    expect(parseOptions({}).accessMode).toBe('selected');
    expect(parseOptions({ access_mode: 'everyone' }).accessMode).toBe('everyone');
    expect(parseOptions({ access_mode: 'quatsch' }).accessMode).toBe('selected');
  });
});
