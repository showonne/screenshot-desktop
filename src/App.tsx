/// <reference types="vite/client" />
import React, { useCallback, useEffect, useState } from 'react'
import Screenshots from '@/components/Screenshots'
import { Bounds } from '@/components/Screenshots/types'
import { Lang } from '@/components/Screenshots/zh_CN'
import './index.less'
import { MessageBoxSyncOptions, NativeImage } from 'electron'
import mitt from 'mitt'
const { ipcRenderer, nativeImage, clipboard } = require('electron')
const path = require('node:path')

let NodeScreenshots: typeof import("node-screenshots").Screenshots;
try {
  NodeScreenshots = require("node-screenshots").Screenshots;
} catch (error) {
    const id = ipcRenderer.sendSync("dialog", {
        message: "截屏需要VS运行库才能正常使用\n是否需要从微软官网（https://aka.ms/vs）下载？",
        buttons: ["取消", "下载"],
        defaultId: 1,
    } as MessageBoxSyncOptions);
    if (id === 1) {
        // shell.openExternal("https://aka.ms/vs/17/release/vc_redist.x64.exe");
    }
}

/**
 * 修复屏幕信息
 * @see https://github.com/nashaofu/node-screenshots/issues/18
 */

let allScreens: (Electron.Display & { captureSync: () => Buffer } & { image?: Buffer })[] = []

function dispaly2screen(displays: Electron.Display[], screens: import("node-screenshots").Screenshots[]) {
  allScreens = [];
  if (!screens) return;
  // todo 更新算法
  for (const i in displays) {
      const d = displays[i];
      const s = screens[i];
      allScreens.push({ ...d, captureSync: () => s.captureSync(true) });
  }
}

export interface Display {
  id: number
  x: number
  y: number
  width: number
  height: number
}

type ScreenshotsEventEmitter = {
  on: (event: string, listener: (lang: Lang) => void) => void;
  off: (event: 'setLang' | 'capture' | 'reset', listener: (...args: any[]) => void) => void;
  emit: (event: string) => void;
  ok: (...args: any[]) => void;
  save: (buffer: ArrayBuffer, options: { bounds: Bounds; display: Display }) => void;
  cancel: () => void;
};

window.screenshots = {
  ...mitt(),
  async ok(args: any) {
    ipcRenderer.send('SCREENSHOTS:OK', ...args)
  },
  cancel() {
    window.screenshots.send('reset')
    ipcRenderer.send('SCREENSHOTS:CANCEL')
  }
}

window.screenshots.send = window.screenshots.emit

export default function App (): JSX.Element {
  const [url, setUrl] = useState<string | undefined>(undefined)
  const [width, setWidth] = useState(window.innerWidth)
  const [height, setHeight] = useState(window.innerHeight)
  const [display, setDisplay] = useState<any>(undefined)
  const [lang, setLang] = useState<Lang | undefined>(undefined)

  const onSave = useCallback(
    async (blob: Blob | null, bounds: Bounds) => {
      if (!display || !blob) {
        return
      }
      window.screenshots.save(await blob.arrayBuffer(), { bounds, display })
    },
    [display]
  )

  const onCancel = useCallback(() => {
    window.screenshots.cancel()
  }, [])

  const onOk = useCallback(
    async (blob: Blob | null, bounds: Bounds) => {
      if (!display || !blob) {
        return console.log('returned:', display)
      }

      // save the blob as a png image
      // const imageBuffer = Buffer.from(await blob.arrayBuffer())

      // const filePath = path.join('/Users/chenjinghui/Desktop', 'test.png')

      // require('fs').writeFile(filePath, imageBuffer, (err: Error) => {
      //   if (err) throw err;
      //   console.log('图片已保存到', filePath);
      // });

      // await window.screenshots.ok(Buffer.from(await blob.arrayBuffer()), { bounds, display })
      // window.screenshots.emit('cancel')
      clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())));
      window.screenshots.cancel()

    },
    [display]
  )

  useEffect(() => {
    const onSetLang = (lang: Lang) => {
      setLang(lang)
    }

    const onCapture = (display: Display, dataURL: string) => {
      console.log('on capture', display, dataURL)
      setDisplay(display)
      setUrl(dataURL)
    }

    const onReset = () => {
      setUrl(undefined)
      setDisplay(undefined)
      // 确保截图区域被重置
      // requestAnimationFrame(() => window.screenshots.reset())
    }

    window.screenshots.on('setLang', onSetLang)
    window.screenshots.on('capture', onCapture)
    window.screenshots.on('reset', onReset)
    // 告诉主进程页面准备完成
    // window.screenshots.ready()
    return () => {
      window.screenshots.off('capture', onCapture)
      window.screenshots.off('setLang', onSetLang)
      window.screenshots.off('reset', onReset)
    }
  }, [])

  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth)
      setHeight(window.innerHeight)
    }

    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [onCancel])

  useEffect(() => {
    console.log(window.screenshots)

    ipcRenderer.on('capture', async (event, _displays: Electron.Display[], mainid: number) => {
      if (!_displays.find((i) => (i as any)["main"])) {
        dispaly2screen(_displays, NodeScreenshots.all());
      }
      // console.log('all', allScreens)
    
      let mainId = mainid;
      for (let i of allScreens) {
          if ((i as any)["main"] || i.id === mainId) {
              if (!i["image"]) i["image"] = i.captureSync();
              // setUrl(i.image)
              const img = nativeImage.createFromBuffer(i.image);
              setUrl(img.toDataURL())
              setDisplay(i)
          } else {
            // console.log('else', i, nativeImage.createFromBuffer(i.captureSync()).toDataURL())
          }
      }
    })
    
  }, [])

  return (
    <div className='body'>
      <Screenshots
        url={url}
        width={width}
        height={height}
        lang={lang}
        onSave={onSave}
        onCancel={onCancel}
        onOk={onOk}
      />
    </div>
  )
}
