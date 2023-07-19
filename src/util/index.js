/**
 * 返回18位唯一字符串
 * @returns {String} guid
 * xx-xxxx-xxxx-xxxx-xxxx
 */
export function getGuid() {
  return 'xx-xxxx-xxxx-xxxx-xxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  })
}