/**
 * 实时录音
 */

import Recorder from 'recorder-core/recorder.wav.min'
import 'recorder-core/src/extensions/waveview'

var testSampleRate = 16000; //采样率
var testBitRate = 16; // 比特率
var sendInterval; // 发送定时器间隔
var muteDetectionChunks // 静音检测声音块数
var mutedMax // 静音检测声音块数的声音阈值，如小于就是无语音输入
var powerLevelChunk = 0 // 静音检测声音块数声音的总音量
var curChunkPower = 0 // 当前声音块的总音量
var wave // 音浪


var realTimeSendTryType = 'wav'; // 录制格式
var realTimeSendTryEncBusy;
var realTimeSendTryTime = 0;
var realTimeSendTryNumber;
var transferUploadNumberMax;
var realTimeSendTryChunk;

//重置环境，每次开始录音时必须先调用此方法，清理环境
var RealTimeSendTryReset = function () {
  realTimeSendTryTime = 0;
};

//=====实时处理核心函数==========
var RealTimeSendTry = function (buffers, bufferSampleRate, isClose) {
  var t1 = Date.now();
  if (realTimeSendTryTime == 0) {
    realTimeSendTryTime = t1;
    realTimeSendTryEncBusy = 0;
    realTimeSendTryNumber = 0;
    transferUploadNumberMax = 0;
    realTimeSendTryChunk = null;
  };
  if (!isClose && t1 - realTimeSendTryTime < sendInterval) {
    return;//控制缓冲达到指定间隔才进行传输
  };
  realTimeSendTryTime = t1;
  var number = ++realTimeSendTryNumber;

  var pcm = [], pcmSampleRate = 0;
  if (buffers.length > 0) {
    //借用SampleData函数进行数据的连续处理，采样率转换是顺带的，得到新的pcm数据
    var chunk = Recorder.SampleData(buffers, bufferSampleRate, testSampleRate, realTimeSendTryChunk, { frameType: isClose ? "" : realTimeSendTryType });

    //清理已处理完的缓冲数据，释放内存以支持长时间录音，最后完成录音时不能调用stop，因为数据已经被清掉了
    for (var i = realTimeSendTryChunk ? realTimeSendTryChunk.index : 0; i < chunk.index; i++) {
      buffers[i] = null;
    };
    realTimeSendTryChunk = chunk;//此时的chunk.data就是原始的音频16位pcm数据（小端LE），直接保存即为16位pcm文件、加个wav头即为wav文件、丢给mp3编码器转一下码即为mp3文件

    pcm = chunk.data;
    pcmSampleRate = chunk.sampleRate;
  };

  //没有新数据，或结束时的数据量太小，不能进行mock转码
  if (pcm.length == 0 || isClose && pcm.length < 2000) {
    TransferUpload(number, null, 0, null, isClose);
    return;
  };

  //实时编码队列阻塞处理
  if (!isClose) {
    if (realTimeSendTryEncBusy >= 2) {
      console.log("编码队列阻塞，已丢弃一帧", 1);
      return;
    };
  };
  realTimeSendTryEncBusy++;

  //通过mock方法实时转码成mp3、wav；16位pcm格式可以不经过此操作，直接发送new Blob([pcm.buffer],{type:"audio/pcm"}) 要8位的就必须转码
  var encStartTime = Date.now();
  var recMock = Recorder({
    type: realTimeSendTryType
    , sampleRate: testSampleRate //采样率
    , bitRate: testBitRate //比特率
  });
  recMock.mock(pcm, pcmSampleRate);
  recMock.stop(function (blob, duration) {
    realTimeSendTryEncBusy && (realTimeSendTryEncBusy--);
    blob.encTime = Date.now() - encStartTime;
    //转码好就推入传输
    TransferUpload(number, blob, duration, recMock, isClose);
  }, function (msg) {
    realTimeSendTryEncBusy && (realTimeSendTryEncBusy--);
    //转码错误？没想到什么时候会产生错误！
    console.log("不应该出现的错误:" + msg, 1);
  });
};

// ***** 转换 bold 到 ArrayBuffer
const blobToBytes = blob => {
  return new Promise((resolve, reject) => {
    let reader = new FileReader()
    reader.readAsArrayBuffer(blob)
    reader.onload = e => resolve(e.target.result)
    reader.onerror = err => reject(err)
  })
}

//=====数据传输函数==========
var TransferUpload = async function (number, blobOrNull, duration, blobRec, isClose) {
  transferUploadNumberMax = Math.max(transferUploadNumberMax, number);
  if (blobOrNull) {
    var blob = blobOrNull;
    var encTime = blob.encTime;
    const isMute = muteDetection()// 静音结尾检测
    const isSpeaking = SpeakingDetection()// 人声检测
    const _blob = blob.slice(44, blob.size, 'audio/wav')
    const bytes = await blobToBytes(_blob)
    const uint8bytes = new Uint8Array(bytes)
    blobCallback && blobCallback(uint8bytes, isMute, isSpeaking)
    //****这里仅 console.log一下 意思意思****
    // var numberFail = number < transferUploadNumberMax ? '<span style="color:red">顺序错乱的数据，如果要求不高可以直接丢弃，或者调大sendInterval试试</span>' : "";
    // var logMsg = "No." + (number < 100 ? ("000" + number).substr(-3) : number) + numberFail;

    // console.log(blob, duration, blobRec, logMsg + "花" + ("___" + encTime).substr(-3) + "ms");

    // if (true && number % 100 == 0) {//emmm....
    //   console.log('clear');
    // };
  };
  if (isClose) {
    console.log("No." + (number < 100 ? ("000" + number).substr(-3) : number) + ":已停止传输");
  };
};

// ***** 静音结尾检测
let chunkIndex = 0
const muteDetection = () => {
  let detectionMsg = { done: false, isMute: null }
  if (chunkIndex < muteDetectionChunks) {
    chunkIndex++
  } else {
    detectionMsg.done = true
    detectionMsg.isMute = powerLevelChunk < mutedMax
    console.log(muteDetectionChunks, `块声音总音量：`, powerLevelChunk, '，静音检测阈值：', mutedMax)
    chunkIndex = 0
    powerLevelChunk = 0
  }
  return detectionMsg.isMute
}

// ***** 检测当前声音块是否有人声
const SpeakingDetection = () => {
  const hasPower = curChunkPower > mutedMax / muteDetectionChunks
  curChunkPower = 0
  return hasPower
}

var rec // 录音对象
var blobCallback // 录制成功回调
/**
 * 开始录音
 * @param {function} callback 
 * @param {object} options 
 * @returns rec object
 */
export function recRealTimeStart(callback = null, options) {
  if (rec) {
    rec.close();
  };
  // 有配置参数
  if (options) {
    sendInterval = options.sendInterval || 300; // 发送定时器间隔
    muteDetectionChunks = options.muteDetectionChunks || 2 // 静音检测声音块数
    mutedMax = options.mutedMax || 200 // 静音检测声音块数的声音阈值，如小于就是无语音输入
  }
  rec = Recorder({
    type: "wav"
    , onProcess: function (buffers, powerLevel, bufferDuration, bufferSampleRate) {
      powerLevelChunk += powerLevel
      curChunkPower += powerLevel
      if (options.wave) {
        wave.input(buffers[buffers.length - 1], powerLevel, bufferSampleRate)
      }
      //推入实时处理，因为是unknown格式，buffers和rec.buffers是完全相同的（此时采样率为浏览器采集音频的原始采样率），只需清理buffers就能释放内存，其他格式不一定有此特性。
      RealTimeSendTry(buffers, bufferSampleRate, false);
    }
  });

  var t = setTimeout(function () {
    console.log("无法录音：权限请求被忽略（超时假装手动点击了确认对话框）", 1);
  }, 8000);

  rec.open(function () {//打开麦克风授权获得相关资源
    clearTimeout(t);
    rec.start();//开始录音
    RealTimeSendTryReset();//重置环境，开始录音时必须调用一次
    if (options.wave) {
      wave = Recorder.WaveView({ elem: options.wave })
    }
  }, function (msg, isUserNotAllow) {
    clearTimeout(t);
    console.log((isUserNotAllow ? "UserNotAllow，" : "") + "无法录音:" + msg, 1);
  });
  blobCallback = callback
  return rec
};

// 停止录音
export function recRealTimeStop() {
  rec.close();//直接close掉即可，这个例子不需要获得最终的音频文件
  RealTimeSendTry([], 0, true);//最后一次发送
};