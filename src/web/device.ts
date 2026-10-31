/** 从浏览器信息里粗略认出设备和浏览器，只用于测试报告。 */

export interface DeviceInfo {
  /** 例如 “iPhone · Safari 18.5”；认不出时为 null。 */
  label: string | null;
  cores: number;
  ua: string;
}

function version(ua: string, re: RegExp): string {
  const m = ua.match(re);
  return m?.[1] ? ` ${m[1].replace(/_/g, '.')}` : '';
}

export function detectDevice(ua: string, cores: number, maxTouchPoints: number): DeviceInfo {
  let device: string | null = null;
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) device = 'iPad';
  else if (/Macintosh|Mac OS X/.test(ua)) device = 'Mac';
  else if (/Android/.test(ua)) device = 'Android';
  else if (/Windows/.test(ua)) device = 'Windows';
  else if (/Linux/.test(ua)) device = 'Linux';

  let browser: string | null = null;
  if (/EdgiOS|Edg\//.test(ua)) browser = 'Edge' + version(ua, /Edg(?:iOS)?\/([\d.]+)/);
  else if (/CriOS/.test(ua)) browser = 'Chrome' + version(ua, /CriOS\/([\d.]+)/);
  else if (/FxiOS/.test(ua)) browser = 'Firefox' + version(ua, /FxiOS\/([\d.]+)/);
  else if (/Firefox\//.test(ua)) browser = 'Firefox' + version(ua, /Firefox\/([\d.]+)/);
  else if (/Chrome\//.test(ua)) browser = 'Chrome' + version(ua, /Chrome\/(\d+)/);
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari' + version(ua, /Version\/([\d.]+)/);
  else if (/AppleWebKit/.test(ua)) browser = 'WebKit' + version(ua, /OS ([\d_]+) like Mac/);

  const label = device && browser ? `${device} · ${browser}` : device ?? browser;
  return { label, cores, ua };
}
