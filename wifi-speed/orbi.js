// wifi-speed/orbi.js — NETGEAR Orbi genie SOAP client (zero deps, CommonJS)
//
// The Orbi RBR50 has no public REST API and no SNMP. The only programmatic
// surface is the NETGEAR "genie" SOAP API on port 5000 — the same calls the
// admin web UI and the Orbi app make. This module logs in and reads the
// attached-device list (per-device link rate, signal, and on most firmware a
// current up/down Mbps reading) plus the WAN traffic meter.
//
// Refs: behavior mirrors the community pynetgear library, reimplemented here in
// Node with no dependencies.

const http = require("http");
const https = require("https");

// Constant session id used by the genie API. Not a secret; the web UI ships it.
const SESSION_ID = "A7D88AE69687E58D9A00";

const SERVICE = {
  DEVICE_INFO: "urn:NETGEAR-ROUTER:service:DeviceInfo:1",
  DEVICE_CONFIG: "urn:NETGEAR-ROUTER:service:DeviceConfig:1",
};

function envelope(bodyXml) {
  return (
    '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' +
    '<SOAP-ENV:Envelope xmlns:SOAPSDK1="http://www.w3.org/2001/XMLSchema"' +
    ' xmlns:SOAPSDK2="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xmlns:SOAPSDK3="http://schemas.xmlsoap.org/soap/encoding/"' +
    ' xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">\n' +
    "<SOAP-ENV:Header><SessionID>" + SESSION_ID + "</SessionID></SOAP-ENV:Header>\n" +
    "<SOAP-ENV:Body>" + bodyXml + "</SOAP-ENV:Body>\n" +
    "</SOAP-ENV:Envelope>"
  );
}

// Minimal regex tag extractor. Genie responses are flat enough that this is
// reliable and avoids pulling in an XML parser dependency.
function tag(xml, name) {
  const m = xml.match(new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">", "i"));
  return m ? m[1].trim() : null;
}

function soapOk(xml) {
  const code = tag(xml, "ResponseCode");
  // "000" = success on genie. Absence of ResponseCode but presence of a
  // *Response element also counts as success.
  if (code !== null) return code === "000" || code === "0";
  return /Response[ >]/.test(xml) && !/SOAP-ENV:Fault/i.test(xml);
}

class OrbiClient {
  constructor(opts = {}) {
    this.scheme = opts.scheme || process.env.ORBI_SCHEME || "http";
    this.host = opts.host || process.env.ORBI_HOST || "orbilogin.com";
    this.port = Number(opts.port || process.env.ORBI_PORT || 5000);
    this.username = opts.username || process.env.ORBI_USER || "admin";
    this.password = opts.password || process.env.ORBI_PASSWORD || "";
    this.timeoutMs = Number(opts.timeoutMs || process.env.ORBI_TIMEOUT_MS || 15000);
    this.loggedIn = false;
  }

  _post(action, bodyXml) {
    const data = envelope(bodyXml);
    const lib = this.scheme === "https" ? https : http;
    const options = {
      host: this.host,
      port: this.port,
      path: "/soap/server_sa/",
      method: "POST",
      rejectUnauthorized: false, // Orbi ships a self-signed cert on https
      headers: {
        "Content-Type": 'text/xml; charset="utf-8"',
        SOAPAction: action,
        "Content-Length": Buffer.byteLength(data),
      },
    };
    return new Promise((resolve, reject) => {
      const req = lib.request(options, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.setTimeout(this.timeoutMs, () => req.destroy(new Error("Orbi request timed out")));
      req.write(data);
      req.end();
    });
  }

  async login() {
    if (!this.password) throw new Error("ORBI_PASSWORD is not set (router admin password).");
    // Two known login shapes across firmware revisions. Try both.
    const variants = [
      {
        action: SERVICE.DEVICE_CONFIG + "#SOAPLogin",
        body:
          "<Authenticate>" +
          "<NewUsername>" + this.username + "</NewUsername>" +
          "<NewPassword>" + this.password + "</NewPassword>" +
          "</Authenticate>",
      },
      {
        action: SERVICE.DEVICE_CONFIG + "#SOAPLogin",
        body:
          '<M1:SOAPLogin xmlns:M1="' + SERVICE.DEVICE_CONFIG + '">' +
          "<Username>" + this.username + "</Username>" +
          "<Password>" + this.password + "</Password>" +
          "</M1:SOAPLogin>",
      },
    ];
    let last;
    for (const v of variants) {
      const res = await this._post(v.action, v.body);
      if (res.status === 200 && soapOk(res.body)) {
        this.loggedIn = true;
        return true;
      }
      last = res;
    }
    throw new Error(
      "Orbi login failed (status " + (last && last.status) + "). Check ORBI_USER/ORBI_PASSWORD and that " +
        this.scheme + "://" + this.host + ":" + this.port + " is reachable."
    );
  }

  async _ensureLogin() {
    if (!this.loggedIn) await this.login();
  }

  // Returns array of devices with whatever metrics the firmware exposes.
  async getAttachedDevices() {
    await this._ensureLogin();
    // Prefer v2 (structured XML, includes signal + often current up/down Mbps).
    const v2 = await this._post(SERVICE.DEVICE_INFO + "#GetAttachDevice2", '<M1:GetAttachDevice2 xmlns:M1="' + SERVICE.DEVICE_INFO + '"></M1:GetAttachDevice2>');
    if (v2.status === 200 && /<Device>/i.test(v2.body)) {
      return parseAttachDevice2(v2.body);
    }
    // Fall back to v1 (delimited string).
    const v1 = await this._post(SERVICE.DEVICE_INFO + "#GetAttachDevice", '<M1:GetAttachDevice xmlns:M1="' + SERVICE.DEVICE_INFO + '"></M1:GetAttachDevice>');
    if (v1.status === 200) {
      const raw = tag(v1.body, "NewAttachDevice");
      if (raw) return parseAttachDevice1(raw);
    }
    throw new Error("Could not read attached devices (v2 status " + v2.status + ", v1 status " + v1.status + ").");
  }

  // WAN traffic meter (cumulative MBytes). Requires the meter to be enabled in
  // the router UI. Best-effort: returns null on failure.
  async getTrafficMeter() {
    try {
      await this._ensureLogin();
      const res = await this._post(SERVICE.DEVICE_CONFIG + "#GetTrafficMeterStatistics", '<M1:GetTrafficMeterStatistics xmlns:M1="' + SERVICE.DEVICE_CONFIG + '"></M1:GetTrafficMeterStatistics>');
      if (res.status !== 200) return null;
      const num = (n) => {
        const v = tag(res.body, n);
        if (!v) return null;
        const f = parseFloat(v.split("/")[0]);
        return Number.isFinite(f) ? f : null;
      };
      return {
        todayUploadMB: num("NewTodayUpload"),
        todayDownloadMB: num("NewTodayDownload"),
        monthUploadMB: num("NewMonthUpload"),
        monthDownloadMB: num("NewMonthDownload"),
      };
    } catch {
      return null;
    }
  }
}

function num(v) {
  if (v == null || v === "") return null;
  const f = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(f) ? f : null;
}

function parseAttachDevice2(xml) {
  const out = [];
  const blocks = xml.match(/<Device>[\s\S]*?<\/Device>/gi) || [];
  for (const b of blocks) {
    const mac = tag(b, "MAC") || tag(b, "NewMAC");
    if (!mac) continue;
    out.push({
      mac,
      ip: tag(b, "IP"),
      name: tag(b, "Name") || tag(b, "ModelName") || mac,
      connection: tag(b, "ConnectionType"),
      linkRateMbps: num(tag(b, "Linkspeed")),
      signalPct: num(tag(b, "SignalStrength")),
      // Present on most Orbi firmware: current per-device throughput in Mbps.
      downMbps: num(tag(b, "Download")),
      upMbps: num(tag(b, "Upload")),
      deviceType: tag(b, "DeviceType"),
      ssid: tag(b, "SSID"),
    });
  }
  return out;
}

function parseAttachDevice1(raw) {
  // Format: "<count>@idx;ip;name;mac;type;linkspeed;signal;allow@idx;..."
  const records = raw.split("@").slice(1);
  const out = [];
  for (const r of records) {
    const f = r.split(";");
    if (f.length < 4) continue;
    out.push({
      mac: f[3] || null,
      ip: f[1] || null,
      name: f[2] || f[3] || null,
      connection: f[4] || null,
      linkRateMbps: num(f[5]),
      signalPct: num(f[6]),
      downMbps: null,
      upMbps: null,
      deviceType: null,
      ssid: null,
    });
  }
  return out.filter((d) => d.mac);
}

module.exports = { OrbiClient, parseAttachDevice2, parseAttachDevice1, _internal: { tag, soapOk } };
