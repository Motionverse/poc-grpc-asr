/**
 * 普通录音
 */

var testSampleRate = 16000; //采样率
var testBitRate = 24; // 比特率
var realTimeSendTryType = 'wav'; // 录制格式
const minSpeakPower = 10 // 检测人生最低音量
import Recorder from 'recorder-core/recorder.wav.min'
import 'recorder-core/src/extensions/waveview'
var wave // 音浪


// ***** 转换 bold 到 ArrayBuffer
const blobToBytes = blob => {
  return new Promise((resolve, reject) => {
    let reader = new FileReader()
    reader.readAsArrayBuffer(blob)
    reader.onload = e => resolve(e.target.result)
    reader.onerror = err => reject(err)
  })
}

var rec // 录音对象
var blobCallback // 录制成功回调
/**
 * 开始录音
 * @param {function} callback 
 * @param {object} options 
 * @returns rec object
 */
export function recStart(callback = null, options) {
  if (rec) {
    rec.close();
  }
  isSpeaking = false
  let newRec = Recorder({
    type: realTimeSendTryType,
    sampleRate: testSampleRate,
    bitRate: testBitRate,
    onProcess: function (buffers, powerLevel, bufferDuration, bufferSampleRate) {
      SpeakingDetection(powerLevel)
      if (options.wave) {
        wave.input(buffers[buffers.length - 1], powerLevel, bufferSampleRate)
      }
    }
  })
  newRec.open(
    () => {
      rec = newRec
      rec.start()
      if (options.wave) {
        wave = Recorder.WaveView({ elem: options.wave })
      }
      blobCallback = callback
      return rec
    },
    err => {
      console.log('录音权限已拒绝' + err)
    }
  )
}

// ***** 检测当前声音块是否有人声
var isSpeaking
const SpeakingDetection = powerLevel => {
  if (!isSpeaking) {
    isSpeaking = powerLevel > minSpeakPower
  }
}

export const recEnd = () => {
  if (!rec) return
  rec.stop(
    async (blob, duration) => {
      const _blob = blob.slice(44, blob.size, 'audio/wav')
      const bytes = await blobToBytes(_blob)
      const uint8bytes = new Uint8Array(bytes)
      blobCallback && blobCallback(uint8bytes, isSpeaking)
      recStop()
    },
    err => {
      console.log('录音失败：' + err)
      recStop()
    }
  )
}


// 停止录音
export function recStop() {
  rec.close()
  rec = null
};