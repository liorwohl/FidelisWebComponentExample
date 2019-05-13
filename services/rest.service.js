//import {fakeWindows} from '../html-helpers/fake-windows.js';

//service for accessing the REST api of the server
export class Rest {

  //convert data object to QueryString formatted string
  urlEncode (requestData) {
    let str = [];
    for (let key in requestData) {
      let vals = requestData[key];
      //if the vals is an array, add all array objects to the QueryString separately
      if (Array.isArray(vals)) {
        for (let val of vals) {
          str.push(encodeURIComponent(key) + '=' + this.encodeOne(val));
        }
      //if the value is not array
      } else {
        if (!this.isEmpty(vals)) {
          str.push(encodeURIComponent(key) + '=' + this.encodeOne(vals));
        }
      }
    }
    return str.join('&');
  }

  //receive a value and return it in the format needed for the requests to the server
  encodeOne (oneValue) {
    //if the value is js Date object then convert to unix time
    if (oneValue instanceof Date) {
      return oneValue.getTime();
    } 
    //if the value is object - return it as a json string
    if (typeof oneValue === 'object') {
      let parentObjects = [];
      return encodeURIComponent(JSON.stringify(oneValue, (key, val) => {
        if (typeof val === 'object' && val !== null) { //to avoid circular pointers in objects
          if (parentObjects.indexOf(val) > -1) { return null; }
          parentObjects.push(val);
        }
        return val;
      }));
    }
    //if is primitive type then return url encoded
    let encodedVal = encodeURIComponent(oneValue);
    if (!this.isEmpty(encodedVal)) {
      return encodedVal;
    }
    //if the data is empty - return null
    return '';
  }

  //convert data object to FormData object (FormData object is sent as 'multipart' in Ajax requests)
  multipartEncode (requestData) {
    let fd = new FormData();
    for (let key in requestData) { 
      let val = requestData[key];
      if (!this.isEmpty(val)) {
        fd.append(key, val);
      }
    }
    return fd;
  }

  isEmpty (string) {
    if (string !== null && string !== undefined && string !== 'null' && string !== '' &&  typeof string !== 'undefined') { 
      return false;
    }
    return true;
  }

  //do http REST request (dont use directly, there are GET, POST, DELETE actions below)
  do (action, method, requestData, isUpload, isDownload, isViewFile, progressCallback) {
    if (!requestData) { requestData = {}; }
    //console.info('mgm/rest Service - ' + method + ' requesting `' + action + '`');// with data: '+JSON.stringify(requestData)+'');

    //set the right Content-Type header and body format for each request type
    let url = action;
    let fetchConf = {
      method: method,
      headers: {},
      cache: 'no-cache',
      credentials: 'include' //have to set this line for Edge and Firefox (Edge is also good with "same-origin", Firefox only with "include")
    };
    if (method === 'GET') {
      fetchConf.mode = 'no-cors'; //this!!! no-cors solve all the problems in npm start (localhost)
    }
    if (!isDownload && (method === 'GET' || method === 'DELETE')) {
      fetchConf.headers['Content-Type'] = 'application/json;charset=UTF-8';
    }
    if ((method === 'GET' || method === 'DELETE') && Object.keys(requestData).length > 0) {
      let queryString = this.urlEncode(requestData);
      if (queryString) { url += '?' + queryString; } //send the data as QueryString for GET/DELETE requests
    }
    if (!isUpload && (method === 'POST' || method === 'PUT')) {
      fetchConf.headers['Content-Type'] = 'application/json';
      fetchConf.body = JSON.stringify(requestData);
    }
    if (isUpload) {
      fetchConf.body = this.multipartEncode(requestData); //convert into FormData object which is being sent as 'multipart' by the browser. it supports file upload
    }

    //fetch doesnt support progress event... so using XMLHttpRequest just for this case of upload + progress callback. This doesnt support some features of normal requests, only the basics + progress
    //https://github.com/github/fetch/issues/89#issuecomment-256610849
    if (isUpload && progressCallback) {
      return new Promise((resolve,reject) => {
        let xhr = new XMLHttpRequest();
        xhr.open(fetchConf.method, url);
        for (let headerKey in fetchConf.headers||{}) {
          xhr.setRequestHeader(headerKey, fetchConf.headers[headerKey]);
        }
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) {
            progressCallback(e.loaded, e.total); //its all in bytes, not kb, to avoid rounding errors - https://jira-sw.hq.fidelis/browse/DEC-9732. to convert to kb divide by 1000 in the controller, not by 1024
          }
        };
        xhr.onload = () => { 
          if (xhr.status === 200) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(JSON.parse(xhr.responseText));
          }
        };
        xhr.onerror = reject;
        xhr.send(fetchConf.body);
      });
    }

    //using fetch for all request types that are not upload + progress callback
    return fetch(url, fetchConf)
      .then(async response => {

        //when response is 401 unauthorized
        if (response && response.status === 401) {
          console.warn('Unauthorized (' + url + '), redirecting to login page', response);
          if (window.location.pathname !== '/pages/login.html') {
            window.location.href = '/pages/login.html';
          }
          response.redirectedToLogin = true;
          throw response;
        }

        //when response came as expected in network level but it had an error for the user
        if (!response || !response.ok && response.status !== 409) { throw response; }
        
        //if requested to download a file from REST service
        if (isDownload) {
          //gets the file content in a JS Blob object
          return response.blob().then(fileBlob => {
            //get the file name and extension from the response Content-Disposition header
            let fileName = response.headers.get('Content-Disposition'); //example: Content-Disposition: attachment; fileName="kaka.pdf"
            if (fileName) { fileName = fileName.substring(fileName.indexOf('=')+1, fileName.length); }
            //save or open the file in browser
            this.saveBlobFile(fileBlob, fileName, isViewFile);
          });
        }

        //if its normal ok response, return JSON as JS object if possible (if its not a valid JSON it will return as string)
        let data = null;
        await response.text().then(text => {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = text;
          }
        });

        if (data.successful === false) { throw data; }

        //if needed confirmation to continue (409)
        if (response.status === 409) {
          return new Promise ((resolve, reject) => {
            let onCancel = () => {
              reject({error: 'Canceled', canceledConfirmationByUser: true});
            };
            let onCnfirm = () => {
              requestData[data.answerParam || 'approve'] = true;
              this.do(action, method, requestData, isUpload, isDownload, isViewFile)
                .then (data => resolve(data))
                .catch(data =>  reject(data));
            };
            let text = (data.conflict||'').split('\n').join('<br />');
            fakeWindows.confirm(text, onCnfirm, onCancel);
          });
        }

        return data;
      })
      //error in REST - networking level
      .catch(async response => {
        if (response.redirectedToLogin) { throw {error: 'Unauthorized'}; }

        console.error('REST error for URL ' + url, response);
        
        if (!response) { throw {error: 'Unknown Error'}; }
        if (response.canceledConfirmationByUser) { throw response; }

        //convert the response into the format the UI is used to receive
        let errorObj = {};
        errorObj.status = response.status;
        if (response.text) {
          await response.text().then(text => {
            try {
              Object.assign(errorObj, JSON.parse(text||{}));
            } catch (e) {
              errorObj.error = text;
            }
          });
        }
        if (!errorObj.error) {
          errorObj.error = response.detailMessage || response.statusText || 'Error';
        }

        //if its status 400 and server returned input name with an error,
        //find in an ugly way an input with a name that includes this "input_param" name and mark it with "invalid" class. 
        //it removes the "invalid" class when the user change the value
        if (response.status === 400 && errorObj.input_param) {
          let input = document.querySelector('input[name$="' + errorObj.input_param + '"]');
          if (input) {
            input.classList.add('invalid'); 
            input.select();
            input.oninput = () => { input.classList.remove('invalid'); };
          }
        }

        //error which is not between 400 and 500 is some weird server bug probably
        if (response.status < 400 || response.status > 500 /*|| response.status === 403*/) {
          this.defaultErrorHandler(errorObj);
        }

        throw errorObj;
      });

  }

  ///////////////////////////////////////////////////////////////////////////////////////

  //get data
  get (action, queryData) {
    return this.do(action, 'GET', queryData);
  }

  //post - add new
  post (action, postData, isUpload, progressCallback) {
    return this.do(action, 'POST', postData, isUpload, false, false, progressCallback);
  }

  //put - edit existing
  put (action, postData, isUpload, progressCallback) {
    return this.do(action, 'PUT', postData, isUpload, false, false, progressCallback);
  }

  //delete
  delete (action, queryData) {
    return this.do(action, 'DELETE', queryData);
  }

  //get + response of a file to this.download
  download (action, queryData/*, progressCallback*/) {
    return this.do(action, 'GET', queryData, false, true, false/*, progressCallback*/);
  }

  //get + response of a file to view in the browser
  viewFile (action, queryData/*, progressCallback*/) {
    return this.do(action, 'GET', queryData, false, true, true/*, progressCallback*/);
  }

  ///////////////////////////////////////////////////////////////////////////////////////

  //a reusable function to show a standard error msg from the server.
  //need to be called every time needed in the request .catch(), because in some requests a different error type is used
  //if the error is communication or permissions problem then it wont this.do anything, the REST function handles them
  defaultErrorHandler (data, altErrorText, onclose) {
    //regular JS error inside a REST promise handler (.then() or .catch) is not shown at all without this line because its like try-catch
    if (data instanceof Error) { 
      //console.error('Error in the Client side error popup:', data);
      let title = '<i class="fas fa-times-circle red-text"></i>&nbsp; Client side error';
      let text = '<p>Please reload this page and try again.<p><br /><p><a onclick="var trace = document.getElementById(\'jsErrorTrace\'); trace.style.display = trace.style.display === \'block\' ? \'none\' : \'block\'" class="toggler-closed small">Technical info</a></p><code class="pre-wrap" id="jsErrorTrace" style="display:none">'+data.stack+'</code>';
      //fakeWindows.alert(text, title, onclose);
      window.alert(text);
    }
    else if (!data || !data.canceledConfirmationByUser && !data.redirectedToLogin) { //-1 and 401 handled globally
      let icon = 'fa-exclamation-triangle orange-text';
      if (data && data.status === 500) { icon = 'fa-times-circle red-text'; }
      if (data && data.error) { altErrorText = data.error; }
      altErrorText = (altErrorText||'').split('\n').join('<br />');
      //fakeWindows.alert(altErrorText, '<i class="fas '+icon+'"></i>&nbsp; Problem', onclose);
      window.alert(altErrorText);
    }
  }

  //will download a blob file (or open in a fakeWindow)
  saveBlobFile (fileBlob, fileName) {
    let url = window.URL.createObjectURL(fileBlob);
    let a = window.document.createElement('a');
    a.href = url;
    a.download = fileName;
    window.document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  }

}

//export a singleton
export let rest = new Rest();