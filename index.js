const express = require("express");
const { exec } = require("child_process");
const os = require("os");
const { createProxyMiddleware } = require("http-proxy-middleware");
const axios = require('axios');
const fs = require("fs");
const path = require("path");
const ps = require('ps-node');

const app = express();

// 环境变量设置
const port = process.env.SERVER_PORT || process.env.PORT || 3000;
const vmms = process.env.VPATH || 'vls';
const vmmport = process.env.VPORT || '8002';
const uuid = process.env.UUID || 'fd80f56e-93f3-4c85-b2a8-c77216c509a7';
const youxuan = process.env.CF_IP || 'YOUXUAN_IP';
const sub_name = process.env.SUB_NAME || 'vps';
const sub_url = process.env.SUB_URL || '';
const nezhaser = process.env.NEZHA_SERVER || '';
const nezhaKey = process.env.NEZHA_KEY || '';
const nezport = process.env.NEZHA_PORT || '443';
const neztls = process.env.NEZHA_TLS || '--tls';
const tok = process.env.TOK || '';
const host_name = process.env.ARG_DOMAIN || '';
const filePath = process.env.PWD || '/tmp/';
// 路由处理
app.get("/", (req, res) => res.send("hello world"));

app.get("/stas", (req, res) => {
  const cmdStr = "ps aux | sed 's@--token.*@--token@g;s@-s.*@-s@g'";
  exec(cmdStr, (err, stdout, stderr) => {
    if (err) {
      res.type("html").send(`<pre>命令行执行错误：\n${err}</pre>`);
    } else {
      res.type("html").send(`<pre>获取系统进程表：\n${stdout}</pre>`);
    }
  });
});

app.get("/info", (req, res) => {
  const cmdStr = "cat /etc/os-release";
  exec(cmdStr, (err, stdout, stderr) => {
    if (err) {
      res.send(`命令行执行错误：${err}`);
    } else {
      res.send(
        `命令行执行结果：\nLinux System:${stdout}\nRAM:${os.totalmem() / 1000 / 1000}MB`
      );
    }
  });
});

app.get("/listen", (req, res) => {
  const cmdStr = "netstat -nltp";
  exec(cmdStr, (err, stdout, stderr) => {
    if (err) {
      res.type("html").send(`<pre>命令行执行错误：\n${err}</pre>`);
    } else {
      res.type("html").send(`<pre>获取系统监听端口：\n${stdout}</pre>`);
    }
  });
});

// 国家代码获取函数
const countryCodeFetchers = [
  () => axios.get('http://ipinfo.io/country'),
  () => axios.get('https://ifconfig.co/country'),
  () => axios.get('https://ipapi.co/country'),
  () => new Promise((resolve, reject) => {
    exec('curl -s http://ipinfo.io/country', (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ data: stdout.trim() });
    });
  })
];

async function getCountryCode() {
  for (const fetcher of countryCodeFetchers) {
    try {
      const response = await fetcher();
      return response.data.trim();
    } catch (error) {
      console.error(`Error getting country code: ${error.message}`);
    }
  }
  console.error('All methods failed, setting country code to "UN"');
  return 'UN';
}

// URL构建和编码
let countryCode = '';
let up_url = '';
let encodedUrl = '';

async function buildUrls() {
  countryCode = await getCountryCode();
  console.log('Country Code:', countryCode);
  const pass = "{PASS}";
  up_url = `${pass}://${uuid}@${youxuan}:443?path=%2F${vmms}%3Fed%3D2048&security=tls&encryption=none&host=${host_name}&type=ws&sni=${host_name}#${countryCode}-${sub_name}`;
  up_url = up_url.replace("{PA", "vl").replace("SS}", "ess");
  encodedUrl = Buffer.from(up_url).toString('base64');
  console.log(`URL_base64: ${encodedUrl}`);
}

// 定时任务
function startCronJob() {
  setInterval(async () => {
    const postData = {
      URL_NAME: sub_name,
      URL: up_url
    };
    
    try {
      const response = await axios.post(sub_url, postData, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('Sub Upload successful');
    } catch (error) {
      console.error('Sub Upload failed:', error.message);
    }
  }, 60 * 1000);
}

app.get(`/${nezhaKey}`, (req, res) => {
  res.send(encodedUrl);
});

// 代理中间件
app.use(
  `/${vmms}`,
  createProxyMiddleware({
    target: `http://127.0.0.1:${vmmport}/`,
    changeOrigin: true,
    pathRewrite: { [`^/${vmms}`]: `/${vmms}` },
    ws: true,
  })
);

// 进程管理
function checkAndStartProcess(processName, startCommand) {
  ps.lookup({ command: processName }, (err, resultList) => {
    if (err) {
      console.log(`Error checking process ${processName}`);
      return;
    }

    if (resultList.length > 0) {
      console.log(`${processName} is already running`);
    } else {
      exec(startCommand, (error, stdout, stderr) => {
        if (error) {
          console.log(`Failed to start ${processName}`);
        } else {
          console.log(`${processName} started successfully!`);
        }
      });
    }
  });
}

function keepProcessesAlive() {
  if (nezhaser && nezhaKey) {
    checkAndStartProcess("nezha.js", `chmod 777 ${path.join(filePath, 'nezha.js')} && ${path.join(filePath, 'nezha.js')} -s ${nezhaser}:${nezport} -p ${nezhaKey} ${neztls}`);
  }

  if (tok) {
    checkAndStartProcess("cff.js", `chmod 777 ${path.join(filePath, 'cff.js')} && ${path.join(filePath, 'cff.js')} tunnel --edge-ip-version auto --protocol http2 run --token ${tok}`);
  }

  checkAndStartProcess("web.js", `VPATH=${vmms} UUID=${uuid} chmod 777 ${path.join(filePath, 'web.js')} && ${path.join(filePath, 'web.js')}`);
}

// 文件下载函数
function downloadFile(url, fileName) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(path.join(filePath, fileName));
    axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    })
    .then(response => {
      response.data.pipe(stream);
      stream.on('finish', () => {
        console.log(`Download ${fileName} successful`);
        resolve();
      });
    })
    .catch(error => {
      console.error(`Download ${fileName} failed: ${error.message}`);
      reject(error);
    });
  });
}

async function initializeDownloads() {
  const platform = os.platform();//可以手动指定
  const arch = os.arch();
  console.log(`os :  ${platform}  arch: ${arch}`);
  console.log(`nezha ： ${path.join(filePath, 'nezha.js')}`);
  console.log(`ccf ： ${path.join(filePath, 'cff.js')}`);
  console.log(`web ： ${path.join(filePath, 'web.js')}`);

  try {
    if (platform === "linux") {
      if (arch === "x64") {
        await downloadFile("https://github.com/dsadsadsss/d/releases/download/sd/kano-6-amd-w", "web.js");
        if (nezhaser && nezhaKey) await downloadFile("https://github.com/dsadsadsss/d/releases/download/sd/nezha-amd", "nezha.js");
        if (tok) await downloadFile("https://github.com/dsadsadsss/1/releases/download/11/cff-amd", "cff.js");
      } else if (arch === "arm64") {
        await downloadFile("https://github.com/dsadsadsss/d/releases/download/sd/kano-6-arm-w", "web.js");
        if (nezhaser && nezhaKey) await downloadFile("https://github.com/dsadsadsss/d/releases/download/sd/nezha-arm", "nezha.js");
        if (tok) await downloadFile("https://github.com/dsadsadsss/1/releases/download/11/cff-arm", "cff.js");
      }
    } else if (platform === "freebsd") {
      await downloadFile("https://github.com/dsadsadsss/1/releases/download/11/botbsd.js", "web.js");
      if (nezhaser && nezhaKey) await downloadFile("https://github.com/dsadsadsss/1/releases/download/11/nezha-bsd.js", "nezha.js");
      if (tok) await downloadFile("https://github.com/dsadsadsss/1/releases/download/11/cff-bsd.js", "cff.js");
    } else {
      console.log("Unsupported platform or architecture");
    }
  } catch (error) {
    console.error("Error during file downloads:", error);
  }
}

// 主函数
async function main() {
  await buildUrls();
  await initializeDownloads();
  
  if (sub_url) {
    startCronJob();
  }

  keepProcessesAlive();
  setInterval(keepProcessesAlive, 60000); // 每分钟检查一次进程

  app.listen(port, () => {
    console.log(`Server listening on port ${port}!\n==============================`);
  });
}

main().catch(console.error);