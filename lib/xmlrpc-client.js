/* Portions originally from: https://github.com/baalexander/node-xmlrpc 
   with this license:

Copyright (c) 2011 Brandon Ace Alexander

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/

var http = require('http')
var events = require('events')
var util = require('util')
var dateFormatter = require('./dateFormatter.js')
var grabbag = require('grabbag')
var sax = require('sax')
/**
 * Serializes the parameter (and child parameters recursively) to XML-RPC.
 *
 * Serialized elements are pushed the the result array 'res'.
 */
function serializeParam(param, res) {
    res.push('<value>')

    switch (typeof param) {
    case 'boolean':
	res.push('<boolean>', param ? '1' : '0', '</boolean>')
	break
	
    case 'string':
	res.push('<string>', grabbag.xmlEscape(param), '</string>')
	break

    case 'number':
	/*
	 * Since no is_int or is_float in JavaScript, determine
	 * interger vs float based on existance of a remained
	 */
	if (param % 1 == 0) {
	    res.push('<int>', param.toString(), '</int>')
	}
	else {
	    res.push('<double>', param.toString(), '</double>')
	}
	break
	
    case 'object':
	/* Uses XML-RPC's nil */
	if (param === null) {
            res.push('<nil/>')
	} else {
            switch (param.constructor.name) {
            case 'Date':
	        /* Uses XML-RPC's date */
	        res.push('<dateTime.iso8601>', dateFormatter.encodeIso8601(param), '</dateTime.iso8601>')
                break
	
            case 'Array':
	        /* Uses XML-RPC's array */
	        res.push('<array>', '<data>')
                for (var i = 0; i < param.length; i++) {
		    serializeParam(param[i], res)
                }
	        res.push('</data>', '</array>')
                break

	    case 'Object':
	        /* Uses XML-RPC's struct */
	        res.push('<struct>')
                for (var key in param) {
		    if (param.hasOwnProperty(key)) {
		        res.push('<member>')
		        res.push('<name>', xmlEscape(key), '</name>')
		        serializeParam(param[key], res)
		        res.push('</member>')
		    }
                }
	        res.push('</struct>')
                break
            default:
	        throw new Error("Unable to serialize object with constructor: " + param.constructor.name)
	    }
        }
	break

    default:
	throw new Error("Unable to serialize type: " + (typeof param))
    }
    res.push('</value>')
}

function XmlRpcParser() {
    var that = this
    this.response = null

    function handleOpenValue(tag) {
	this.stateData.valueStack.push(this.stateData.curValue)

	if (this.state === 'STRUCTVALUE') {
	    this.stateData.stateStack.push('STRUCTDATA')
	} else {
	    this.stateData.stateStack.push(this.state)
	}
    }

    function handleOpenDatatype(tag) {
	switch (tag.name) {
	case 'array':
	    this.stateData.curValue = new Array()
	    break
	case 'struct':
	    this.stateData.curValue = {}
	    break
	default:
	    this.stateData.curValue = ''
	    break
	}
    }

    function handleDatatype() {
	var thisValue = this.stateData.curValue
	var newState = this.stateData.stateStack.pop()
	this.stateData.curValue = this.stateData.valueStack.pop()

	switch (newState) {
	case 'VALUE':
	    this.stateData.paramValue = thisValue
	    break
	case 'ARRAYVALUES':
	    this.stateData.curValue.push(thisValue)
	    break
	case 'STRUCTDATA':
	    this.stateData.curValue[this.stateData.curName] = thisValue
	    break
	default:
	    throw new Error('Expecting newState to be VALUE, ARRAYVALUES, STRUCTDATA')
	}
	return newState
    }

    function appendCurValue(data) {
	this.stateData.curValue += data
    }

    function appendNameData(data) {
	this.stateData.nameData += data
    }

    /*
      Parsing state-machine:

      METHODRESPONSE -> o(methodResponse):PARAMS 
      PARAMS -> o(params):PARAM | c(methodResponse):METHODRESPONSE
      PARAM -> o(param):VALUE | c(params):PARAMS
      VALUE -> o(value):DATATYPE | c(param):PARAM
      DATATYPE -> o(<datatype>):DATA | o(array):ARRAYDATA | o(struct):STRUCTDATA | c(value):[VALUE, ARRAYVALUES, STRUCTDATA])
      DATA -> o:# | c(<datatype>):DATATYPE
      ARRAYDATA -> o(data):ARRAYVALUES | c(array):DATATYPE

      ARRAYVALUES -> o(value):DATATYPE | c(data):ARRAYDATA

      STRUCTDATA -> o(member):NAME | c(struct):DATATYPE | c(member):MEMBER

      NAME -> o(name):NAMEDATA 
      NAMEDATA -> o:# | c(name):STRUCTVALUE

      STRUCTVALUE -> o(value):DATATYPE
    */
    var parseStates = {
	'METHODRESPONSE' : { 
	    'o:methodResponse': 'PARAMS',
	    'e' : ['',  function () { that.response = this.stateData.params[0] } ],
	},

	'PARAMS' : { 'o:params' : 'PARAM', 
		     'c:methodResponse' : 'METHODRESPONSE' },

	'PARAM' : {
	    'o:param' : 'VALUE' ,
	    'c:params' : 'PARAMS'
	},
	'VALUE' : {
	    'o:value' : ['DATATYPE', handleOpenValue],
	    'c:param' : ['PARAM', function () { this.stateData.params.push(this.stateData.paramValue) }] 
	},
	'ARRAYVALUES' : {
	    'o:value' : ['DATATYPE', handleOpenValue],
	    'c:data' : 'ARRAYDATA'
	},
	'STRUCTVALUE' : {
	    'o:value' : ['DATATYPE', handleOpenValue]
	},
	'DATATYPE' : {
	    'o:i4' : ['I4DATA', handleOpenDatatype],
	    'o:int' : ['INTDATA', handleOpenDatatype],
	    'o:boolean' : ['BOOLEANDATA', handleOpenDatatype],
	    'o:string' : ['STRINGDATA', handleOpenDatatype],
	    'o:double' : ['DOUBLEDATA', handleOpenDatatype],
	    'o:dateTime.iso8601' : ['DATEDATA', handleOpenDatatype],
	    'o:array' : ['ARRAYDATA', handleOpenDatatype],
	    'o:struct' : ['STRUCTDATA', handleOpenDatatype],

	    'c:value' : [null, handleDatatype],
	},
	'I4DATA' : { 
	    'c:i4' : ['DATATYPE', function () { this.stateData.curValue = parseInt(this.stateData.curValue) }],
	    't' : ['I4DATA', appendCurValue],
	},
	'INTDATA' : {
	    'c:int' : ['DATATYPE', function () { this.stateData.curValue = parseInt(this.stateData.curValue) }],
	    't' : ['INTDATA', appendCurValue],
	},
	'BOOLEANDATA' : {
	    'c:boolean' : ['DATATYPE', function () { this.stateData.curValue = this.stateData.curValue === '1' ? true : false }],
	    't' : ['BOOLEANDATA', appendCurValue],
	},
	'STRINGDATA' : {
	    'c:string' : 'DATATYPE',
	    't' : ['STRINGDATA', appendCurValue],
	},
	'DOUBLEDATA' : {
	    'c:double' : ['DATATYPE', function () { this.stateData.curValue = parseFloat(this.stateData.curValue) }],
	    't' : ['DOUBLEDATA', appendCurValue],
	},
	'DATEDATA' : {
	    'c:dateTime.iso8601' : 'DATATYPE',
	    't' : ['DATEDATA', appendCurValue],
	},
	'ARRAYDATA' : {
	    'o:data' : 'ARRAYVALUES',
	    'c:array' : 'DATATYPE',
	},
	'STRUCTDATA' : { 
	    'o:member' : 'NAME',
	    'o:struct' : 'DATATYPE',
	    'c:struct' : 'DATATYPE', 
	    'c:member' : ['STRUCTDATA', function () { this.stateData.curName = null }]
	},

	'NAME' : { 'o:name' : ['NAMEDATA', function(tag) { this.stateData.nameData = '' }] },
	'NAMEDATA' : {
	    'c:name' : ['STRUCTVALUE', function () { this.stateData.curName = this.stateData.nameData}],
	    't' : ['NAMEDATA', appendNameData],
	},

	'ARRAYVALUES' : {  },

	'*' : { 't' : null }
    }

    var initState = {
	stateStack: new Array(),
	valueStack: new Array(),
	curValue: null,
	paramValue: null,
	params: new Array(),
	nameData: null,
    }

    this.xmlStateMachine = new grabbag.XmlStateMachine(new sax.SAXStream(true), parseStates, 'METHODRESPONSE', initState)
}

XmlRpcParser.prototype.write = function write(chunk) {
    return this.xmlStateMachine.write(chunk)
}

XmlRpcParser.prototype.end = function end() {
    return this.xmlStateMachine.end()
}

function XmlRpcCall(options, methodName) {
    events.EventEmitter.call(this)

    this.sync = (options.sync === true)
/*Connection: 'keep-alive'*/
    this.httpOptions =  {method: 'POST', host: options.host, port: options.port, path: options.path, headers: {} }
    if (!this.sync) {
        this.outstream = http.request(this.httpOptions)
    }
    this.inDataParam = false
    this.reqData = ""
    this.collect('<?xml version="1.0"?><methodCall><methodName>' + methodName + '</methodName><params>')
}
util.inherits(XmlRpcCall, events.EventEmitter)
exports.XmlRpcCall = XmlRpcCall

XmlRpcCall.prototype.collect = function collect(data) {
    if (this.sync) {
        this.reqData += data
    } else {
        this.outstream.write(data)
    }
}

XmlRpcCall.prototype.abort = function abort() {
    this.outstream.abort()
    this.outstream = null
}

XmlRpcCall.prototype.pushParam = function pushParam(paramValue) {
    var res = Array()
    res.push("<param>")
    serializeParam(paramValue, res)
    res.push("</param>")
    this.collect(res.join(''))
}

XmlRpcCall.prototype.pushDataParam = function pushDataParam(paramName) {
    this.inDataParam = true
    return new XmlRpcData(this, paramName)
}

XmlRpcCall.prototype.end = function end() {
    var that = this
    this.collect("</params></methodCall>")

    var xmlRpcParser = new XmlRpcParser()

    if (this.sync) {
        this.httpOptions.headers['Content-Length'] = this.reqData.length
        this.outstream = http.request(this.httpOptions)
        this.outstream.write(this.reqData)
    }

    this.outstream.on('response', onResponse)
    this.outstream.on('drain', onDrain)

    function onResponse(response) {
        if (response.statusCode !== 200) {
            that.emit('complete', "500 error", null)
        } else {
	    response.on('data', onResponseData)
	    response.on('end', onResponseEnd)
        }
    }

    function onResponseData(chunk) {
	xmlRpcParser.write(chunk)
    }

    function onResponseEnd() {
	xmlRpcParser.end()
	that.outstream = null
	that.emit('complete', null, xmlRpcParser.response)
    }

    function onDrain() {
	that.emit('drain')
    }

    this.outstream.end()
}

function XmlRpcData(xmlRpcCall, paramName) {
    this.xmlRpcCall = xmlRpcCall
    this.outstream = xmlRpcCall.outstream
    this.collect("<param><value><base64>")
    this.previous = null
}

XmlRpcData.prototype.push = function push(data) {
    var remainder
    var buf

    if (this.previous !== null) {
	buf = new Buffer(this.previous.length + data.length)
	this.previous.copy(buf)
	data.copy(buf, this.previous.length)
    } else {
	buf = data
    }
    remainder = buf.length  % 3

    if (remainder == 0) {
	this.previous = null
    } else {
	this.previous = buf.slice(buf.length - remainder)
    }

    if (buf.length - remainder > 0) {
	return this.collect(buf.toString('base64', 0, buf.length - remainder))
    } else {
	return true
    }
}

XmlRpcData.prototype.end = function end() {
    if (this.previous !== null) {
	this.collect(this.previous.toString('base64'))
	this.previous = null
    }
    this.collect("</base64></value></param>")
    this.inDataParam = false
}
