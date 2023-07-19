<template>
  <button v-if="!rec" @click="start">开启实时语音识别</button>
  <button v-else @click="stop">关闭实时语音识别</button>
  <button @mousedown="recordStart" @mouseup="recordEnd">长按语音识别</button>
  <p>{{textList}}</p>
  <div class="wave"></div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { recRealTimeStart, recRealTimeStop } from '@/util/RealTimeRec' // 实时录音
import { recStart, recStop, recEnd } from '@/util/Rec' // 常规录音
const textList = ref()
const token = '' // motionverse token 必填
const rec = ref()

// --------------------------------------实时录音
// 点击开启实时语音识别
const start = async () => {
  createGrpcUser() // 生成用户uuid
  const checkAuthRes = await requestServer(null, false, true) // 初始化 isEnd = true
  if (checkAuthRes && checkAuthRes.array && checkAuthRes.array[4] && checkAuthRes.array[4] == 200) {
    startRealTimeRec()
  } else if (checkAuthRes && checkAuthRes.array && checkAuthRes.array[4] && checkAuthRes.array[5]) {
    console.error(checkAuthRes.array[5])
  } else {
    console.error('error')
  }
}

// 开始实时录音
const recStatus = ref(false)
const startRealTimeRec = () => {
  rec.value = recRealTimeStart(
    async (uint8bytes, isMute, isSpeaking) => {
      if (!recStatus.value) {
        recStatus.value = isSpeaking
      }
      if (recStatus.value) {
        if (isMute) {
          recStatus.value = false
          console.log('没有语音输入')
          // rec.value.pause() // 识别文字后有其他操作，需要暂停录音
        }
        const res = await requestServer(uint8bytes, recStatus.value, false)
        const resJson = JSON.parse(res.array[0])
        if (resJson && resJson.success && resJson.detail == 'finish_sentence' && resJson.text.length) {
          textList.value = resJson.text
        }
      }
    },
    {
      SendInterval: 300, // 发送定时器间隔
      muteDetectionChunks: 2, // 静音检测声音块数
      mutedMax: 200, // 静音检测声音块数的声音阈值，如小于就是无语音输入
      wave: '.wave'
    }
  )
  document.querySelector('.wave').style.display = 'block'
}

// 结束实时录音，清空
const stop = () => {
  rec.value && recRealTimeStop()
  rec.value = null
  document.querySelector('.wave').style.display = 'none'
}

onBeforeUnmount(() => {
  if (rec.value) {
    stop()
  }
})

// --------------------------------------长按录音
const recordStart = async e => {
  e.preventDefault()
  createGrpcUser() // 生成用户uuid
  const checkAuthRes = await requestServer(null, false, true) // 初始化 isEnd = true
  if (checkAuthRes && checkAuthRes.array && checkAuthRes.array[4] && checkAuthRes.array[4] == 200) {
    startRec1()
  } else if (checkAuthRes && checkAuthRes.array && checkAuthRes.array[4] && checkAuthRes.array[5]) {
    console.error(checkAuthRes.array[5])
  } else {
    console.error('error')
  }
}

// 开始录音
const startRec1 = () => {
  rec.value = recStart(
    async (uint8bytes, isSpeaking) => {
      if (isSpeaking) {
        const res = await requestServer(uint8bytes, false, false)
        const resJson = JSON.parse(res.array[0])
        if (resJson && resJson.success && resJson.detail == 'finish_sentence') {
          if (resJson.text.length) {
            textList.value = resJson.text
          } else {
            textList.value = '没有识别出文字'
          }
        }
      } else {
        textList.value = '没有检测到声音'
      }
    },
    {
      wave: '.wave'
    }
  )
  document.querySelector('.wave').style.display = 'block'
}

const recordEnd = () => {
  document.querySelector('.wave').style.display = 'none'
  recEnd()
}

// --------------------------------------grpc网络请求
// 1、引入生成文件
import { ASRClient } from '@/proto/paraformer_grpc_web_pb'
import { Request } from '@/proto/paraformer_pb'

// 2、实例化客户端
const client = new ASRClient('https://motionverseapi.deepscience.cn:7010', null, null)

/**
 * 请求GRPC服务
 * @param {uint8array} uint8bytes
 * @param {boolean} isSpeaking
 * @param {boolean} isEnd
 * @returns rec object
 */
const requestServer = (uint8bytes, isSpeaking, isEnd) => {
  // 3、实例化请求数据
  const request = new Request()
  request.setAudioData(uint8bytes)
  request.setLanguage('zh-CN')
  request.setUser(userName.value)
  request.setSpeaking(isSpeaking)
  request.setIsend(isEnd)
  request.setAccessToken(token)
  console.log('isSpeaking', isSpeaking)
  console.log('isEnd', isEnd)
  // 4、调用客户端方法发送请求
  return new Promise((resolve, reject) => {
    client.recognizeStreamResp(request, {}, (err, res) => {
      try {
        if (err) {
          throw err
        }
        resolve(res)
      } catch (error) {
        reject(error)
      }
    })
  })
}

// -------------------- 生成 grpc 用户信息
import { getGuid } from '@/util/index'
const userName = ref('')
const createGrpcUser = () => {
  userName.value = 'xinbeiyang|' + getGuid()
}
</script>

<style>
.wave {
  height: 200px;
  width: 200px;
  margin: 0 auto;
  border-radius: 50%;
  background-color: gainsboro;
  position: absolute;
  left: 50%;
  bottom: 20px;
  display: none;
}
</style>