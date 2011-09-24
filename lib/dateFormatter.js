/*
  Originally from: https://github.com/baalexander/node-xmlrpc.git
  Commit: 7c92aee1e1c7b9257df3

  Copyright (c) 2011 Brandon Ace Alexander

  Permission is hereby granted, free of charge, to any person
  obtaining a copy of this software and associated documentation files
  (the "Software"), to deal in the Software without restriction,
  including without limitation the rights to use, copy, modify, merge,
  publish, distribute, sublicense, and/or sell copies of the Software,
  and to permit persons to whom the Software is furnished to do so,
  subject to the following conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
  BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
  ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
  CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

var dateFormatter = exports

/*
 * Converts a date time stamp following the ISO8601 format to a JavaScript Date
 * object.
 *
 * @param time - String representation of timestamp
 * @return Date object
 */
dateFormatter.decodeIso8601 = function(time) {

  var regexp = '([0-9]{4})([-]?([0-9]{2})([-]?([0-9]{2})'
    + '(T([0-9]{2}):([0-9]{2})(:([0-9]{2})(\.([0-9]+))?)?'
    + '(Z|(([-+])([0-9]{2}):([0-9]{2})))?)?)?)?'

  var d = time.toString().match(new RegExp(regexp))

  var offset = 0
  var date = new Date(d[1], 0, 1)

  if (d[3]) {
    date.setMonth(d[3] - 1)
  }
  if (d[5]) {
    date.setDate(d[5])
  }
  if (d[7]) {
    date.setHours(d[7])
  }
  if (d[8]) {
    date.setMinutes(d[8])
  }
  if (d[10]) {
    date.setSeconds(d[10])
  }
  if (d[12]) {
    date.setMilliseconds(Number('0.' + d[12]) * 1000)
  }

  return date
}

/**
 * Converts a JavaScript Date object to an ISO8601 timestamp.
 *
 * @param date - Date object
 * @return String representation of timestamp
 */
dateFormatter.encodeIso8601 = function(date) {
  return zeroPad(date.getFullYear(), 4)
    + zeroPad(date.getMonth() + 1, 2)
    + zeroPad(date.getDate(), 2)
    + 'T'
    + zeroPad(date.getHours(), 2)
    + ':'
    + zeroPad(date.getMinutes(), 2)
    + ':'
    + zeroPad(date.getSeconds(), 2)
}

/**
 * Helper function to pad the digits with 0s to meet date formatting
 * requirements.
 *
 * @param digit - the number to pad
 * @param length - length of digit string, prefix with 0s if not already length
 * @return String with the padded digit
 */
function zeroPad(digit, length) {
  var padded = '' + digit
  while (padded.length < length) {
    padded = '0' + padded
  }

  return padded
}
