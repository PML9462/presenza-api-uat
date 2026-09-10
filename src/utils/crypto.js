const crypto = require("crypto")
const dotenv = require("dotenv")
const path = require("path")
dotenv.config({ path: path.join(__dirname, "../../.env") });

var key = process.env.CRYPTO_SERVER_KEY
var iv = key.slice(0, 16)
const algorithm = "aes-256-cbc" //Using AES encryption
let encoding = "base64"

function encrypt(text) {
	var cipher = crypto.createCipheriv("aes256", key, iv)
	var result = cipher.update(text, "utf8", encoding)
	result += cipher.final(encoding)
	return result
}

function decrypt(text) {
	var decipher = crypto.createDecipheriv("aes256", key, iv)
	var result = decipher.update(text, "base64")
	result += decipher.final()
	return result
}

function ccAvenueEncrypt (plainText,workingKey){
	var m = crypto.createHash('md5');
    	m.update(workingKey);
   	var key = m.digest('binary');
      	var iv = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f';	
	var cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
	var encoded = cipher.update(plainText,'utf8','hex');
	encoded += cipher.final('hex');
    	return encoded;
}
function ccAvenueDecrypt (encText,workingKey){
	var m = crypto.createHash('md5');
	m.update(workingKey)
	var key = m.digest('binary');
var iv = '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f';	
var decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
	var decoded = decipher.update(encText,'hex','utf8');
decoded += decipher.final('utf8');
	return decoded;
}
module.exports = {
	encrypt,
	decrypt,
	ccAvenueEncrypt,
	ccAvenueDecrypt
}
