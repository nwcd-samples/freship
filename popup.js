/**
 * Date: 2022-05-08
 * Author: Jianqiao
 * Description: Elabrating the workflow and details of popup  
 */

 
 let localAllIP = await chrome.storage.local.get('allIP');
 let localResult = await chrome.storage.local.get('result');
 let allIP = localAllIP.allIP;
 let result = localResult.result;

 let detailDiv = document.querySelector('div.detail');
if(allIP && result){  
    let allIPLen = allIP.length;
    let resultLen = result.length;
    console.log('popup: allIPLen %d, result %O',allIPLen,resultLen);
    document.querySelector('progress').max = allIPLen;
    document.querySelector('progress').value = resultLen;
    document.querySelector('label[for="progress"]').innerText = resultLen +'/'+ allIPLen;
    detailDiv.innerHTML = '';
    let ul = document.createElement('ul');
    result.forEach(item=>{
        let li = document.createElement('li');
        li.appendChild(document.createTextNode(item.ip +' '+ item.used));         
        ul.appendChild(li);       
    });
    detailDiv.appendChild(ul);

} else{
    detailDiv.innerHTML = 'please upload ip list and target csv file';
}

 // begin to uploaded 
let btnUpload = document.getElementById('btnUpload');
let targetUploadBtn = document.getElementById('targetUpload');

btnUpload.addEventListener("click", async()=> {
    // clear last processing output
    document.querySelector('progress').value = 0;
    document.querySelector('label[for=progress]').innerText = '';
    let ipListFile = document.getElementById('fileIPList');
    let targetFile = document.getElementById('fileTarget');
    if(ipListFile.files[0] && targetFile.files[0]){
        let ipListFileName = ipListFile.files[0].name;
        let targetFileName = targetFile.files[0].name;
        if(targetFileName === 'target.csv'){
            let accountId = ipListFileName.substr(0,ipListFileName.indexOf('.'));
            chrome.storage.local.set({accountId:accountId});
            let allIP,targetAccounts;
            let ipIndex = 0;
            Papa.parse(ipListFile.files[0], {
                header:true,
                complete: function(results) {
                    allIP = results.data.filter(v => {return v.ip && v.ip.trim()!=''}).map((v) => {return v.ip});
                    chrome.storage.local.set({allIP:allIP});
                    // chrome.storage.local.set({allIPLen:allIP.length});
                    // chrome.storage.local.set({ipIndex: ipIndex});
                    let currentState = {'ipIndex': 0, 'allIPLen': allIP.length};
                    chrome.storage.local.set({currentState: currentState});
                    console.log('popup: data in ip list csv:',allIP);
                    // store uploaded ip list in case extension crashed
                    // chrome.storage.sync.set({allIP});
                    // let port = chrome.runtime.connect({name:'popup'});
                    // port.postMessage({type:ipListFileName,content:data});
                    Papa.parse(targetFile.files[0], {
                        header:true,
                        complete: function(results) {
                            targetAccounts = results.data.filter(v => {return v.ID && v.ID.trim()!=''}).map(v => {return v.ID});
                            chrome.storage.local.set({targetAccounts:targetAccounts});
                            console.log('popup: data in target csv:',targetAccounts);
                            // store uploaded ip list in case extension crashed
                            // chrome.storage.sync.set({allIP});
                            // let port = chrome.runtime.connect({name:'popup'});
                            // port.postMessage({ipList: ipList,accountList: accountList,accountId: accountId});
                            chrome.runtime.sendMessage('uploaded',(response) =>{
                                console.log('popup: received background response %s',response);
                            });
                        }
                    });
                }
            });
        } else{
            alert('target file name must be target.csv');
        }

    }else{
        alert('please upload ip list file');
    }
});

let hrefLog = document.getElementById('hrefLog');
hrefLog.addEventListener('click',async () => {
    const localLogs = await chrome.storage.local.get('logs');
    if(localLogs.logs && localLogs.logs.length > 0){
        const logs = localLogs.logs;
    
        const blob = new Blob([logs.join('')], {type : "text/url;charset=utf-8"});
        // const blob = new Blob([csv], {type : "application/x-download;charset=UTF-8"});
        const url = URL.createObjectURL(blob);
        let date = new Date();
        const localYear = date.getFullYear();
        const localMonth = date.getMonth() < 9 ? '0'+(date.getMonth()+1) : ''+(date.getMonth()+1);
        const localDate = date.getDate() < 10 ? '0'+date.getDate():''+ date.getDate();
        const localHour = date.getHours() < 10 ? '0'+date.getHours():''+ date.getHours();
        const localMinute = date.getMinutes() < 10 ? '0'+date.getMinutes():''+ date.getMinutes();
        const localSecond = date.getSeconds() < 10 ? '0'+date.getSeconds():''+ date.getSeconds();
        
        let filename = 'freship-'+localYear + localMonth + localDate+localHour + localMinute + localSecond+'.log';
        hrefLog.href = url;
        hrefLog.download = filename;
    } else{
        alert('please upload files before downloading logs');
    }
});