import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { giteeConfig, githubConfig } from '@md/shared/configs'

import fetch from '@md/shared/utils/fetch'
import * as tokenTools from '@md/shared/utils/tokenTools'
import { base64encode, safe64, utf16to8 } from '@md/shared/utils/tokenTools'
import Buffer from 'buffer-from'
import COS from 'cos-js-sdk-v5'
import CryptoJS from 'crypto-js'
import * as qiniu from 'qiniu-js'
import OSS from 'tiny-oss'
import { v4 as uuidv4 } from 'uuid'

function getConfig(useDefault: boolean, platform: string) {
  if (useDefault) {
    // load default config file
    const config = platform === `github` ? githubConfig : giteeConfig
    const { username, repoList, branch, accessTokenList } = config

    // choose random token from access_token list
    const tokenIndex = Math.floor(Math.random() * accessTokenList.length)
    const accessToken = accessTokenList[tokenIndex].replace(`doocsmd`, ``)

    // choose random repo from repo list
    const repoIndex = Math.floor(Math.random() * repoList.length)
    const repo = repoList[repoIndex]

    return { username, repo, branch, accessToken }
  }

  // load configuration from localStorage
  const customConfig = JSON.parse(localStorage.getItem(`${platform}Config`)!)

  // split username/repo
  const repoUrl = customConfig.repo
    .replace(`https://${platform}.com/`, ``)
    .replace(`http://${platform}.com/`, ``)
    .replace(`${platform}.com/`, ``)
    .split(`/`)
  return {
    username: repoUrl[0],
    repo: repoUrl[1],
    branch: customConfig.branch || `master`,
    accessToken: customConfig.accessToken,
  }
}

/**
 * 获取 `年/月/日` 形式的目录
 * @returns string
 */
function getDir() {
  const date = new Date()
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, `0`)
  const day = date.getDate().toString().padStart(2, `0`)
  return `${year}/${month}/${day}`
}

/**
 * 根据文件名获取它以 `时间戳+uuid` 的形式
 * @param {string} filename 文件名
 * @returns {string} `时间戳+uuid`
 */
function getDateFilename(filename: string) {
  const currentTimestamp = new Date().getTime()
  // 获取最后一个点号后的内容作为文件扩展名
  const fileSuffix = filename.split(`.`).pop()
  return `${currentTimestamp}-${uuidv4()}.${fileSuffix}`
}

// -----------------------------------------------------------------------
// GitHub File Upload
// -----------------------------------------------------------------------

async function ghFileUpload(content: string, filename: string) {
  const useDefault = localStorage.getItem(`imgHost`) === `default`
  const { username, repo, branch, accessToken } = getConfig(
    useDefault,
    `github`,
  )
  const dir = getDir()
  const url = `https://api.github.com/repos/${username}/${repo}/contents/${dir}/`
  const dateFilename = getDateFilename(filename)
  const res = await fetch<{ content: {
    download_url: string
  } }, {
    content: {
      download_url: string
    }
    data?: {
      content: {
        download_url: string
      }
    }
  }>({
    url: url + dateFilename,
    method: `put`,
    headers: {
      Authorization: `token ${accessToken}`,
    },
    data: {
      content,
      branch,
      message: `Upload by ${window.location.href}`,
    },
  })
  const githubResourceUrl = `raw.githubusercontent.com/${username}/${repo}/${branch}/`
  const cdnResourceUrl = `fastly.jsdelivr.net/gh/${username}/${repo}@${branch}/`
  res.content = res.data?.content || res.content
  return useDefault
    ? res.content.download_url.replace(githubResourceUrl, cdnResourceUrl)
    : res.content.download_url
}

// -----------------------------------------------------------------------
// Gitee File Upload
// -----------------------------------------------------------------------

async function giteeUpload(content: any, filename: string) {
  const useDefault = localStorage.getItem(`imgHost`) === `default`
  const { username, repo, branch, accessToken } = getConfig(useDefault, `gitee`)
  const dir = getDir()
  const dateFilename = getDateFilename(filename)
  const url = `https://gitee.com/api/v5/repos/${username}/${repo}/contents/${dir}/${dateFilename}`
  const res = await fetch<{ content: {
    download_url: string
  } }, {
    content: {
      download_url: string
    }
    data: {
      content: {
        download_url: string
      }
    }
  }>({
    url,
    method: `POST`,
    data: {
      content,
      branch,
      access_token: accessToken,
      message: `Upload by ${window.location.href}`,
    },
  })
  res.content = res.data?.content || res.content
  return encodeURI(res.content.download_url)
}

// -----------------------------------------------------------------------
// Qiniu File Upload
// -----------------------------------------------------------------------

function getQiniuToken(accessKey: string, secretKey: string, putPolicy: {
  scope: string
  deadline: number
}) {
  const policy = JSON.stringify(putPolicy)
  const encoded = base64encode(utf16to8(policy))
  const hash = CryptoJS.HmacSHA1(encoded, secretKey)
  const encodedSigned = hash.toString(CryptoJS.enc.Base64)
  return `${accessKey}:${safe64(encodedSigned)}:${encoded}`
}

async function qiniuUpload(file: File) {
  const { accessKey, secretKey, bucket, region, path, domain } = JSON.parse(
    localStorage.getItem(`qiniuConfig`)!,
  )
  const token = getQiniuToken(accessKey, secretKey, {
    scope: bucket,
    deadline: Math.trunc(new Date().getTime() / 1000) + 3600,
  })
  const dir = path ? `${path}/` : ``
  const dateFilename = dir + getDateFilename(file.name)
  const observable = qiniu.upload(file, dateFilename, token, {}, { region })
  return new Promise<string>((resolve, reject) => {
    observable.subscribe({
      next: (result) => {
        console.log(result)
      },
      error: (err) => {
        reject(err.message)
      },
      complete: (result) => {
        resolve(`${domain}/${result.key}`)
      },
    })
  })
}

// -----------------------------------------------------------------------
// AliOSS File Upload
// -----------------------------------------------------------------------

async function aliOSSFileUpload(file: File) {
  const dateFilename = getDateFilename(file.name)
  const { region, bucket, accessKeyId, accessKeySecret, useSSL, cdnHost, path }
    = JSON.parse(localStorage.getItem(`aliOSSConfig`)!)
  const dir = path ? `${path}/${dateFilename}` : dateFilename
  const secure = useSSL === undefined || useSSL
  const protocol = secure ? `https` : `http`
  const client = new OSS({
    region,
    bucket,
    accessKeyId,
    accessKeySecret,
    secure,
  })

  try {
    await client.put(dir, file)
    return cdnHost ? `${cdnHost}/${dir}` : `${protocol}://${bucket}.${region}.aliyuncs.com/${dir}`
  }
  catch (e) {
    return Promise.reject(e)
  }
}

// -----------------------------------------------------------------------
// TxCOS File Upload
// -----------------------------------------------------------------------

async function txCOSFileUpload(file: File) {
  const dateFilename = getDateFilename(file.name)
  const { secretId, secretKey, bucket, region, path, cdnHost } = JSON.parse(
    localStorage.getItem(`txCOSConfig`)!,
  )
  const cos = new COS({
    SecretId: secretId,
    SecretKey: secretKey,
  })
  return new Promise<string>((resolve, reject) => {
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: `${path}/${dateFilename}`,
        Body: file,
      },
      (err, data) => {
        if (err) {
          reject(err)
        }
        else if (cdnHost) {
          resolve(
            path === ``
              ? `${cdnHost}/${dateFilename}`
              : `${cdnHost}/${path}/${dateFilename}`,
          )
        }
        else {
          resolve(`https://${data.Location}`)
        }
      },
    )
  })
}

// -----------------------------------------------------------------------
// Minio File Upload
// -----------------------------------------------------------------------

async function minioFileUpload(file: File) {
  const dateFilename = getDateFilename(file.name)
  const { endpoint, port, useSSL, bucket, accessKey, secretKey } = JSON.parse(
    localStorage.getItem(`minioConfig`)!,
  )
  const s3Client = new S3Client({
    endpoint: `${useSSL ? `https` : `http`}://${endpoint}${port ? `:${port}` : ``}`,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    region: `auto`,
    forcePathStyle: true,
  })

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: dateFilename,
    ContentType: file.type,
  })
  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 })

  // 使用原生 fetch 而不是自定义的 axios fetch
  const response = await window.fetch(presignedUrl, {
    method: `PUT`,
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  })

  if (!response.ok) {
    throw new Error(`MinIO upload failed: ${response.status} ${response.statusText}`)
  }
  return `${useSSL ? `https` : `http`}://${endpoint}${port ? `:${port}` : ``}/${bucket}/${dateFilename}`
}

// -----------------------------------------------------------------------
// mp File Upload
// -----------------------------------------------------------------------
interface MpResponse {
  access_token: string
  expires_in: number
  errcode: number
  errmsg: string
}
async function getMpToken(appID: string, appsecret: string, proxyOrigin: string) {
  const data = localStorage.getItem(`mpToken:${appID}`)
  if (data) {
    const token = JSON.parse(data)
    if (token.expire && token.expire > new Date().getTime()) {
      return token.access_token
    }
  }
  const requestOptions = {
    method: `POST`,
    data: {
      grant_type: `client_credential`,
      appid: appID,
      secret: appsecret,
    },
  }
  let url = `https://api.weixin.qq.com/cgi-bin/stable_token`
  if (proxyOrigin) {
    url = `${proxyOrigin}/cgi-bin/stable_token`
  }
  const res = await fetch<any, MpResponse>(url, requestOptions)
  if (res.access_token) {
    const tokenInfo = {
      ...res,
      expire: new Date().getTime() + res.expires_in * 1000,
    }
    localStorage.setItem(`mpToken:${appID}`, JSON.stringify(tokenInfo))
    return res.access_token
  }
  return ``
}
// Cloudflare Pages 环境
const isCfPage = import.meta.env.CF_PAGES === `1`
async function mpFileUpload(file: File) {
  let { appID, appsecret, proxyOrigin } = JSON.parse(
    localStorage.getItem(`mpConfig`)!,
  )
  // 未填写代理域名且是cfpages环境
  if (!proxyOrigin && isCfPage) {
    proxyOrigin = window.location.origin
  }
  const access_token = await getMpToken(appID, appsecret, proxyOrigin)
  if (!access_token) {
    throw new Error(`获取 access_token 失败`)
  }

  const formdata = new FormData()
  formdata.append(`media`, file, file.name)

  const requestOptions = {
    method: `POST`,
    data: formdata,
  }

  let url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${access_token}&type=image`
  const fileSizeInMB = file.size / (1024 * 1024)
  const fileType = file.type.toLowerCase()
  if (fileSizeInMB < 1 && (fileType === `image/jpeg` || fileType === `image/png`)) {
    url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${access_token}`
  }
  if (proxyOrigin) {
    url = url.replace(`https://api.weixin.qq.com`, proxyOrigin)
  }

  const res = await fetch<any, { url: string }>(url, requestOptions)

  if (!res.url) {
    throw new Error(`上传失败，未获取到URL`)
  }

  let imageUrl = res.url
  if (proxyOrigin && window.location.href.startsWith(`http`)) {
    imageUrl = `https://wsrv.nl?url=${encodeURIComponent(imageUrl)}`
  }

  return imageUrl
}

// -----------------------------------------------------------------------
// Cloudflare R2 File Upload
// -----------------------------------------------------------------------

async function r2Upload(file: File) {
  const { accountId, accessKey, secretKey, bucket, path, domain } = JSON.parse(
    localStorage.getItem(`r2Config`)!,
  )
  if (!accountId || !accessKey || !secretKey || !bucket) {
    throw new Error(`R2 upload failed: 配置信息不完整，请检查账号、密钥和存储桶配置`)
  }
  const dir = path ? `${path}/` : ``
  const filename = dir + getDateFilename(file.name)

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`

  console.log(`R2 Upload attempt:`, {
    filename,
    bucket,
    contentType: file.type,
    fileSize: file.size,
    endpoint,
    accountId,
    domain,
  })

  // 首先测试endpoint连通性
  console.log(`Testing R2 endpoint connectivity...`)
  try {
    const testResponse = await window.fetch(endpoint, {
      method: 'HEAD',
      mode: 'no-cors'
    })
    console.log(`Endpoint test result:`, testResponse)
  } catch (testError) {
    console.error(`Endpoint connectivity test failed:`, testError)
    // 继续执行，因为no-cors模式可能会失败但实际连接正常
  }

  try {
    // 配置S3Client for Cloudflare R2
    const client = new S3Client({
      endpoint,
      region: `auto`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    })

    const contentType = file.type || `application/octet-stream`
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: filename,
      ContentType: contentType,
    })

    console.log(`Generating presigned URL...`)
    // 生成签名URL并通过浏览器直接上传，避免SDK在浏览器环境的流处理问题
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 })

    console.log(`R2 Presigned URL generated:`, {
      url: signedUrl.substring(0, 100) + '...', // 只显示前100个字符保护隐私
      hostname: new URL(signedUrl).hostname,
      pathname: new URL(signedUrl).pathname,
      protocol: new URL(signedUrl).protocol,
    })

    // 使用最简单的fetch配置，避免浏览器兼容性问题
    console.log(`Attempting upload with fetch...`)

    let uploadResponse: Response
    try {
      uploadResponse = await window.fetch(signedUrl, {
        method: `PUT`,
        body: file,
        headers: {
          'Content-Type': contentType,
        },
      })
    } catch (fetchError) {
      console.error(`Fetch error details:`, {
        error: fetchError,
        message: fetchError instanceof Error ? fetchError.message : String(fetchError),
        name: fetchError instanceof Error ? fetchError.name : 'Unknown',
        stack: fetchError instanceof Error ? fetchError.stack : undefined,
      })

      // 尝试使用不同的方法
      console.log(`Fetch failed, trying with different approach...`)
      try {
        uploadResponse = await window.fetch(signedUrl, {
          method: `PUT`,
          body: file,
        })
      } catch (secondError) {
        console.error(`Second fetch attempt also failed:`, secondError)

        // 尝试第三种方法：使用XMLHttpRequest
        console.log(`Trying XMLHttpRequest as fallback...`)
        try {
          uploadResponse = await new Promise<Response>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('PUT', signedUrl)
            xhr.setRequestHeader('Content-Type', contentType)

            xhr.onload = () => {
              const mockResponse = new Response(xhr.response, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: new Headers()
              })
              resolve(mockResponse)
            }

            xhr.onerror = () => {
              reject(new Error(`XMLHttpRequest failed: ${xhr.statusText}`))
            }

            xhr.send(file)
          })

          console.log(`XMLHttpRequest succeeded where fetch failed!`)
        } catch (xhrError) {
          console.error(`XMLHttpRequest also failed:`, xhrError)

          throw new Error(`R2 upload failed: 所有网络请求方法都失败了。

详细分析：
1. Fetch API失败: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}
2. 简化Fetch失败: ${secondError instanceof Error ? secondError.message : String(secondError)}
3. XMLHttpRequest失败: ${xhrError instanceof Error ? xhrError.message : String(xhrError)}

这通常表明：
- Windows环境下的网络限制
- 防火墙/杀毒软件阻止了对 ${new URL(signedUrl).hostname} 的连接
- DNS解析问题
- 公司网络策略限制

建议：
1. 检查Windows防火墙设置
2. 暂时禁用杀毒软件
3. 尝试使用移动热点网络
4. 检查是否有网络代理设置`)
        }
      }
    }

    console.log(`Upload response received:`, {
      ok: uploadResponse.ok,
      status: uploadResponse.status,
      statusText: uploadResponse.statusText,
      headers: Object.fromEntries(uploadResponse.headers.entries()),
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => ``)
      console.error(`R2 Upload failed with status:`, uploadResponse.status, uploadResponse.statusText, errorText)

      // 提供详细的错误信息和调试指导
      if (uploadResponse.status === 0) {
        throw new Error(`R2 upload failed: 网络请求状态为0，这通常表示请求被浏览器或网络环境阻止。

可能原因：
- CORS配置问题 (但您的配置看起来正确)
- 网络防火墙阻止
- 浏览器安全策略
- DNS解析问题

建议检查：
1. 确认CORS配置正确
2. 尝试不同网络环境
3. 检查浏览器控制台的Network面板`)
      }
      if (uploadResponse.status === 403) {
        throw new Error(`R2 upload failed: 访问被拒绝 (403)。

请检查：
1. 访问密钥(Access Key)和密钥(Secret Key)是否正确
2. 密钥是否有对应存储桶的写权限
3. 存储桶名称是否正确
4. Account ID是否正确

详细错误: ${uploadResponse.status} ${uploadResponse.statusText}${errorText ? ` - ${errorText}` : ``}`)
      }
      if (uploadResponse.status === 404) {
        throw new Error(`R2 upload failed: 存储桶不存在 (404)。

请检查：
1. 存储桶名称是否正确
2. Account ID是否正确
3. 存储桶是否在正确的账户下

详细错误: ${uploadResponse.status} ${uploadResponse.statusText}${errorText ? ` - ${errorText}` : ``}`)
      }

      throw new Error(
        `R2 upload failed: 上传接口返回 ${uploadResponse.status} ${uploadResponse.statusText}${errorText ? ` - ${errorText}` : ``}`,
      )
    }

    console.log(`R2 Upload successful!`)

    // 生成正确的访问URL - 使用简单的方式
    const normalizedDomain = (domain || ``).trim().replace(/\/+$/, ``)
    const finalUrl = normalizedDomain
      ? normalizedDomain.startsWith(`http`)
        ? `${normalizedDomain}/${filename}`
        : `https://${normalizedDomain}/${filename}`
      : `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${filename}`

    console.log(`R2 Upload final URL:`, finalUrl)
    return finalUrl
  }
  catch (error) {
    console.error(`R2 upload failed:`, error)

    if (error instanceof Error) {
      if (error.message.includes(`getReader`)) {
        throw new Error(`R2 upload failed: 当前浏览器环境缺少 ReadableStream 支持，请升级浏览器或关闭兼容模式`)
      }
      // 检查常见的网络错误
      if (error.message.includes(`Failed to fetch`) || error.message.includes(`TypeError`)) {
        throw new Error(`R2 upload failed: 网络请求失败。

这通常是由于以下原因：
1. CORS配置问题 (但您的配置看起来正确)
2. Windows防火墙或杀毒软件阻止请求
3. 网络代理或公司防火墙
4. 浏览器安全策略
5. R2服务临时不可用

建议尝试：
- 在浏览器开发者工具的Network标签页检查具体的网络错误
- 暂时禁用防火墙/杀毒软件
- 使用不同的网络环境
- 尝试不同的浏览器`)
      }
      if (error.message.includes(`403`) || error.message.includes(`Forbidden`)) {
        throw new Error(`R2 upload failed: 访问被拒绝，请检查访问密钥权限和CORS配置`)
      }
      if (error.message.includes(`NoSuchBucket`)) {
        throw new Error(`R2 upload failed: 存储桶不存在，请检查bucket名称`)
      }

      throw new Error(`R2 upload failed: ${error.message}`)
    }

    throw new Error(`R2 upload failed: ${String(error)}`)
  }
}

// -----------------------------------------------------------------------
// Upyun File Upload
// -----------------------------------------------------------------------

async function upyunUpload(file: File) {
  const { bucket, operator, password, path, domain } = JSON.parse(
    localStorage.getItem(`upyunConfig`)!,
  )
  const filename = `${path}/${getDateFilename(file.name)}`
  const uri = `/${bucket}/${filename}`
  const arrayBuffer = await file.arrayBuffer()
  const date = new Date().toUTCString()
  const method = `PUT`
  const signStr = [method, uri, date].join(`&`)
  const passwordMd5 = CryptoJS.MD5(password).toString()
  const signature = CryptoJS.HmacSHA1(signStr, passwordMd5).toString(CryptoJS.enc.Base64)
  const authorization = `UPYUN ${operator}:${signature}`
  const url = `https://v0.api.upyun.com${uri}`
  const res = await window.fetch(url, {
    method: `PUT`,
    headers: {
      'Authorization': authorization,
      'X-Date': date,
      'Content-Type': file.type,
    },
    body: arrayBuffer,
  })

  if (!res.ok) {
    throw new Error(`上传失败: ${await res.text()}`)
  }

  return `${domain}/${filename}`
}

// -----------------------------------------------------------------------
// Telegram File Upload
// -----------------------------------------------------------------------
async function telegramUpload(file: File): Promise<string> {
  const { token, chatId } = JSON.parse(localStorage.getItem(`telegramConfig`)!)

  // 1. sendPhoto
  const form = new FormData()
  form.append(`chat_id`, chatId)
  form.append(`photo`, file, file.name)

  const sendRes = await fetch<any, {
    ok: boolean
    result: {
      photo: { file_id: string }[]
    }
  }>({
    url: `https://api.telegram.org/bot${token}/sendPhoto`,
    method: `POST`,
    data: form,
  })

  if (!sendRes.ok || !sendRes.result.photo.length) {
    throw new Error(`Telegram sendPhoto 失败`)
  }
  // 取最大的分辨率那张图
  const fileId = sendRes.result.photo[sendRes.result.photo.length - 1].file_id

  // 2. getFile
  const fileRes = await fetch<any, {
    ok: boolean
    result: { file_path: string }
  }>({
    url: `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
    method: `GET`,
  })
  if (!fileRes.ok) {
    throw new Error(`Telegram getFile 失败`)
  }

  const filePath = fileRes.result.file_path
  // 3. 拼出下载地址
  return `https://api.telegram.org/file/bot${token}/${filePath}`
}

// -----------------------------------------------------------------------
// Cloudinary File Upload
// -----------------------------------------------------------------------

/**
 * localStorage 中 cloudinaryConfig 的示例：
 * {
 *   "cloudName": "demo",
 *   "apiKey": "1234567890",
 *   "apiSecret": "abcdefg1234567890",     // 可选：若未填写则走 unsigned preset
 *   "uploadPreset": "unsigned_preset",     // 可选：有 apiSecret 时可省略
 *   "folder": "blog/image",                // 可选：Cloudinary 目录，留空则根路径
 *   "domain": "https://cdn.example.com"    // 可选：自定义访问域名 / CDN 域名
 * }
 */
async function cloudinaryUpload(file: File): Promise<string> {
  const {
    cloudName,
    apiKey,
    apiSecret,
    uploadPreset,
    folder = ``,
    domain,
  } = JSON.parse(localStorage.getItem(`cloudinaryConfig`)!)

  if (!cloudName || !apiKey)
    throw new Error(`Cloudinary 配置缺少 cloudName / apiKey`)

  const timestamp = Math.floor(Date.now() / 1000) // Cloudinary 要求秒级时间戳
  const formData = new FormData()
  formData.append(`file`, file)
  formData.append(`api_key`, apiKey)
  formData.append(`timestamp`, `${timestamp}`)

  // ---------- 1) 需要签名的场景 ----------
  if (apiSecret) {
    // 参与签名的字段需按字典序排列并拼接成 a=b&c=d… 的格式
    const params: string[] = []
    if (folder)
      params.push(`folder=${folder}`)
    if (uploadPreset)
      params.push(`upload_preset=${uploadPreset}`)
    params.push(`timestamp=${timestamp}`)

    const signatureBase = params.sort().join(`&`)
    const signature = CryptoJS.SHA1(signatureBase + apiSecret).toString()
    formData.append(`signature`, signature)
  }
  // ---------- 2) unsigned preset ----------
  else if (uploadPreset) {
    formData.append(`upload_preset`, uploadPreset)
  }
  else {
    throw new Error(`未配置 apiSecret 时必须提供 uploadPreset`)
  }

  if (folder)
    formData.append(`folder`, folder)

  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
  const res = await fetch<any, { secure_url?: string, url?: string }>(uploadUrl, {
    method: `POST`,
    data: formData,
  })

  const originUrl = res.secure_url || res.url
  if (!originUrl)
    throw new Error(`Cloudinary 返回缺少 url 字段`)

  // 如果配置了自定义域名，则把 host 换掉
  if (domain) {
    const { pathname, search } = new URL(originUrl)
    return `${domain}${pathname}${search}`
  }

  return originUrl
}

// -----------------------------------------------------------------------
// formCustom File Upload
// -----------------------------------------------------------------------

async function formCustomUpload(content: string, file: File) {
  const str = `
    async (CUSTOM_ARG) => {
      ${localStorage.getItem(`formCustomConfig`)}
    }
  `
  return new Promise<string>((resolve, reject) => {
    const exportObj = {
      content, // 待上传图片的 base64
      file, // 待上传图片的 file 对象
      util: {
        axios: fetch, // axios 实例
        CryptoJS, // 加密库
        OSS, // tiny-oss
        COS, // cos-js-sdk-v5
        Buffer, // buffer-from
        uuidv4, // uuid
        qiniu, // qiniu-js
        tokenTools, // 一些编码转换函数
        getDir, // 获取 年/月/日 形式的目录
        getDateFilename, // 根据文件名获取它以 时间戳+uuid 的形式
      },
      okCb: resolve, // 重要: 上传成功后给此回调传 url 即可
      errCb: reject, // 上传失败调用的函数
    }
    // eslint-disable-next-line no-eval
    eval(str)(exportObj).catch((err: any) => {
      console.error(err)
      reject(err)
    })
  })
}

export function fileUpload(content: string, file: File) {
  const imgHost = localStorage.getItem(`imgHost`)
  if (!imgHost) {
    localStorage.setItem(`imgHost`, `default`)
  }
  switch (imgHost) {
    case `aliOSS`:
      return aliOSSFileUpload(file)
    case `minio`:
      return minioFileUpload(file)
    case `txCOS`:
      return txCOSFileUpload(file)
    case `qiniu`:
      return qiniuUpload(file)
    case `gitee`:
      return giteeUpload(content, file.name)
    case `github`:
      return ghFileUpload(content, file.name)
    case `mp`:
      return mpFileUpload(file)
    case `r2`:
      return r2Upload(file)
    case `upyun`:
      return upyunUpload(file)
    case `telegram`:
      return telegramUpload(file)
    case `cloudinary`:
      return cloudinaryUpload(file)
    case `formCustom`:
      return formCustomUpload(content, file)
    default:
      // return file.size / 1024 < 1024
      //     ? giteeUpload(content, file.name)
      //     : ghFileUpload(content, file.name);
      return ghFileUpload(content, file.name)
  }
}
