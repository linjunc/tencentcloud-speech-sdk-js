class ASR {
  constructor(options) {
    this.stream = null;
    this.audioTrack = options.audioTrack;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.speechRecognizer = null;
    this.isCanSendData = false;
    this.audioData = [];
    this.timer = null;
    this.secretkey = options.secretKey;
    this.params = {
      secretid: options.secretId,
      appid: options.appId,
      engine_model_type: options.engine_model_type || '16k_zh',
      voice_format: options.voice_format || 1,
      hotword_id: options.hotword_id,
      needvad: options.needvad,
      filter_dirty: options.filter_dirty,
      filter_modal: options.filter_modal,
      filter_punc: options.filter_punc,
      convert_num_mode: options.convert_num_mode,
      word_info: options.word_info,
    };
    this.OnRecognitionStart = function () {};
    this.OnSentenceBegin = function () {};
    this.OnRecognitionResultChange = function () {};
    this.OnSentenceEnd = function () {};
    this.OnRecognitionComplete = function () {};
    this.OnError = function () {};
  }
  signCallback (signStr) {
    const secretKey = this.secretkey;
    const hash = window.CryptoJSTest.HmacSHA1(signStr, secretKey);
    const bytes = Uint8ArrayToString(toUint8Array(hash));
    return window.btoa(bytes);
  }
  start () {
    if (!this.speechRecognizer) {
      const params = {
        // 用户参数
        signCallback: this.signCallback.bind(this),
        ...this.params,
      }
      this.speechRecognizer = new SpeechRecognizer(params);
    }

    // 开始识别
    this.speechRecognizer.OnRecognitionStart = (res) => {
      this.isCanSendData = true;
      this.OnRecognitionStart(res)
    };
    // 一句话开始
    this.speechRecognizer.OnSentenceBegin = (res) => {
      this.OnSentenceBegin(res);
    };
    // 识别变化时
    this.speechRecognizer.OnRecognitionResultChange = (res) => {
      this.OnRecognitionResultChange(res);
    };
    // 一句话结束
    this.speechRecognizer.OnSentenceEnd = (res) => {
      this.OnSentenceEnd(res);
    };
    // 识别结束
    this.speechRecognizer.OnRecognitionComplete = (res) => {
      this.OnRecognitionComplete(res);
    };
    // 识别错误
    this.speechRecognizer.OnError = (res) => {
      this.isCanSendData = false;
      this.OnError(res);
    };

    // 建立连接
    this.speechRecognizer.start();
    this.getAudioData();
  }
  getAudioData() {
    const mediaStream = new MediaStream();
    mediaStream.addTrack(this.audioTrack);
    this.stream = mediaStream;
    const mediaStreamSource = this.audioContext.createMediaStreamSource(mediaStream); // 将声音对象输入这个对象
    // 创建一个音频分析对象，采样的缓冲区大小为0（自动适配），输入和输出都是单声道
    const scriptProcessor = this.audioContext.createScriptProcessor(0,1,1);
    scriptProcessor.onaudioprocess = e => {
      // 去处理音频数据
      const inputData = e.inputBuffer.getChannelData(0);
      const output = to16kHz(inputData);
      const audioData = to16BitPCM(output);
      this.audioData.push(...new Int8Array(audioData.buffer));
      if (this.timer) {
        return false;
      }
      if (this.isCanSendData) {
        let data = this.audioData.splice(0, 1280);
        let audioDataArray = new Int8Array(data)
        this.speechRecognizer.write(audioDataArray);
      }
      // 发送数据
      this.timer = setInterval( () => {
        if (this.isCanSendData) {
          const data = this.audioData.splice(0, 1280);
          const audioDataArray = new Int8Array(data)
          this.speechRecognizer.write(audioDataArray);
        }
      }, 40)
    };
    // 连接
    mediaStreamSource.connect(scriptProcessor);
    scriptProcessor.connect(this.audioContext.destination);
  }
  recorderStop(audioContext) {
    if (!(/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))){
      audioContext && audioContext.suspend();
    }
    audioContext && audioContext.suspend();
    // 关闭通道
    if (this.stream) {
      this.stream.getTracks().map((val) => {
        val.stop();
      });
      this.stream = null;
    }
  }
  stop() {
    clearInterval(this.timer);
    this.speechRecognizer.stop();
    this.recorderStop(this.audioContext);
  }

}
window.ASR = ASR;

function toUint8Array(wordArray) {
  // Shortcuts
  const words = wordArray.words;
  const sigBytes = wordArray.sigBytes;

  // Convert
  const u8 = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return u8;
}

function Uint8ArrayToString(fileData){
  let dataString = '';
  for (let i = 0; i < fileData.length; i++) {
    dataString += String.fromCharCode(fileData[i]);
  }
  return dataString;
}
function to16BitPCM(input) {
  const dataLength = input.length * (16 / 8);
  const dataBuffer = new ArrayBuffer(dataLength);
  const dataView = new DataView(dataBuffer);
  let offset = 0;
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    dataView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return dataView;
}
function to16kHz(audioData) {
  const data = new Float32Array(audioData);
  const fitCount = Math.round(data.length * (16000 / 44100));
  const newData = new Float32Array(fitCount);
  const springFactor = (data.length - 1) / (fitCount - 1);
  newData[0] = data[0];
  for (let i = 1; i < fitCount - 1; i++) {
    const tmp = i * springFactor;
    const before = Math.floor(tmp).toFixed();
    const after = Math.ceil(tmp).toFixed();
    const atPoint = tmp - before;
    newData[i] = data[before] + (data[after] - data[before]) * atPoint;
  }
  newData[fitCount - 1] = data[data.length - 1];
  return newData;
}