let result = new Array();
let searchInfos = new Array();
let searchInfoIndex = 0;
let allIPLen = 0;
let allIP = new Array();
let allIPIndex = 0;
let targetAccounts = new Array();
let accountId = "";
let logger = new Array();
let receivedTabMessages = new Array();
let accountsPerIP = new Set();
const TABS_NUMBER = 20; // 20
const WORKER_TAB_URL = 'https://operatornet-midway.cn-northwest-1.amazonaws.cn/console/operator/account-lookup-by-ip';

chrome.runtime.onInstalled.addListener(() => {
    console.log('clear all local storage');
    chrome.storage.local.clear();
});

// this event doesn't support filter
async function tabOnUpdateListener(tabId,changedInfo,tabInfo){
    const WORKER_URL_PATH = '/console/operator/account-lookup-by-ip';
    const TOKEN_URL_PATH = '/console/operator';
    // const TOKEN_URL = 'https://operatornet-midway.cn-northwest-1.amazonaws.cn/';
    const MIDWAY_URL = 'midway-auth.aws-border.cn';
    // since the lookup url may end with ?#, so we use url path name to check if it's expected url
    let tabUrl = new URL(tabInfo.url);
    if(tabUrl.host === MIDWAY_URL){
        console.log('background: session exipred please login first');
        log('WARN','session exipred please login first. tab url ' + tabInfo.url);
    }
    else if(tabUrl.pathname === TOKEN_URL_PATH && changedInfo.status === 'complete'){   
        allIP = await getArrayFromLocalStorage(allIP,'allIP');
        allIPIndex = await getNonNegativeInt(allIPIndex,'allIPIndex');
        console.log('background: token tab refreshed, status for last IP : allIP.length %d, allIPIndex %d, receivedTabMessages.length %d, searchInfos.length %'
        ,allIP.length, allIPIndex,receivedTabMessages.length,searchInfos.length);
        log('INFO','token tab refreshed, status for last IP ' +allIP[allIPIndex-1] + ': allIP length ' + allIP.length 
        + ',receivedTabMessages.length ' + receivedTabMessages.length + ', current allIPIndex ' + allIPIndex);
        // not upload files yet
        if(allIP.length === 0){
            log('WARN','allIP is empty. user maybe not upload files or allIP lost in runtime');
            console.log('background: allIP is empty. user maybe not upload files or allIP lost in runtime');
            return;
        };
        if(allIPIndex === allIP.length){
            result = await getArrayFromLocalStorage(result,'result');
            console.log('background: all IP processed, begin to export csv. result ',result);
            log('INFO','tabs.onUpdated.addListener: all IP processed, begin to export csv ' + result.length);
            exportCSV(tabId,result);
        }else{
            let nextIP = allIP[allIPIndex];
            log('INFO','begin to process ip ' + nextIP + ' . current status : allIPIndex ' 
            + allIPIndex + ', allIP length ' + allIP.length);
            createSearchInfo(nextIP,accountId,targetAccounts);
            let firstWorkerTab = await chrome.tabs.create({url:WORKER_TAB_URL});
            console.log('background: first worker tab created %O for ip %s. current state: searchInfoIndex %d, searchInfos %O',firstWorkerTab,nextIP,searchInfoIndex,searchInfos);
        }
    }
    else if(tabUrl.pathname === WORKER_URL_PATH && changedInfo.status === 'complete'){
        searchInfos = await getArrayFromLocalStorage(searchInfos,'searchInfos');
        allIPIndex = await getNonNegativeInt(allIPIndex,'allIPIndex');
        log('INFO','ready to assign ip info to tab ' + tabId + '. current status: allIPIndex' 
        + allIPIndex + ', searchInfoIndex ' + searchInfoIndex)
        let datePartition = searchInfos[searchInfoIndex++];
        datePartition.tabId = tabId;
        console.log('background: ready to assign ip search info %O to tab %d. ' 
        + 'current status: searchInfos %O, searchInfoIndex %d',datePartition,tabId,searchInfos,searchInfoIndex);

        chrome.scripting.executeScript({
            target: {tabId: tabId},
            func: searchByPartitionFunc,
            args:[datePartition]
        });
        log('INFO','assigned ip' + datePartition.ip + 'to tab ' + datePartition.tabId + '. current status: searchInfos.length '
        + searchInfos.length + ', searchInfoIndex ' + searchInfoIndex + ',allIPIndex '+allIPIndex);
        // create next worker tab
        delayCounter(1000000000);
        if(searchInfoIndex < TABS_NUMBER){
            let nextWorkerTab = await chrome.tabs.create({url: WORKER_TAB_URL});
            console.log('background: next worker tab created %O. current state: searchInfoIndex %d, searchInfos %O',nextWorkerTab,searchInfoIndex,searchInfos);
            // log('INFO','next worker tab created. current status: tab id' + nextWorkerTab.id +',searchInfos.length '+ searchInfos.length + ', searchInfoIndex ' + searchInfoIndex);
        }
    }
}
chrome.tabs.onUpdated.addListener(tabOnUpdateListener);

async function tabRemovedListener (tabId,removedInfo){
    const WORKER_TAB_URL = 'https://operatornet-midway.cn-northwest-1.amazonaws.cn/console/operator/account-lookup-by-ip';
    let workerTabs = await chrome.tabs.query({url:WORKER_TAB_URL});
    allIPIndex = await getNonNegativeInt(allIPIndex,'allIPIndex');
    allIPLen = await getNonNegativeInt(allIPLen,'allIPLen');
    if(workerTabs.length === 0 && allIPIndex < allIPLen){
        await refreshToken();
    }
}
chrome.tabs.onRemoved.addListener(tabRemovedListener);

/**
 * process first ip
 */
chrome.runtime.onMessage.addListener(async (request,sender,sendResponse) =>{
    console.log('background: received message %O from %O',request,sender);
    if(request === 'uploaded'){
        sendResponse('copy');
        let localAllIP = await chrome.storage.local.get('allIP');
        let localAllIPLen = await chrome.storage.local.get('allIPLen');
        let localTargetAccounts = await chrome.storage.local.get('targetAccounts');
        let localAccountId = await chrome.storage.local.get('accountId');

        allIP = localAllIP.allIP;
        allIPLen = localAllIPLen.allIPLen;
        targetAccounts = localTargetAccounts.targetAccounts;
        accountId = localAccountId.accountId;
        console.log('background: retrieved message from local storage: allIP %O, targetAccounts %O, accountId %s and allIPLen %d',allIP,targetAccounts,accountId,allIPLen);
        log('INFO','retrieved message from local storage: allIP '+allIP.length + ', targetAccounts '+targetAccounts.length + ', accountId '+accountId + ', allIPLen '+allIPLen);
        await refreshToken();
    }
});

/**
 * get worker tab response
 */
 let onConnectListener = chrome.runtime.onConnect.addListener(port => {
   
    port.onMessage.addListener(async msg =>{
        // DO NOT use local storage to keep receivedTabMessages, it may cause its value doesn't update timely issue
        // actually for any variable which's value changed frequently, DO NOT persist it into local storage
        receivedTabMessages.push(msg);
        console.log('background: receivedTabMessages %O after receiving a tab response %O',receivedTabMessages,msg);
        log('INFO','received new message: tabId ' + msg.tabId +', ip ' + msg.ip + ', succeeded '+ msg.succeeded + 
        '. current receivedTabMessages.length ' + receivedTabMessages.length + ', allIPIndex ' + allIPIndex + ',allIP.length ' + allIP.length);
        let accounts = msg.rows;
        if(accounts && accounts.length > 0){
            accounts.forEach((v)=>accountsPerIP.add(v));
        }
        if(receivedTabMessages.length === TABS_NUMBER){
            let arrReceivedMessages = new Array();
            receivedTabMessages.forEach(v=>{arrReceivedMessages.push('succeeded: '+v.succeeded + ',used: ' +v.used)})
            let arrAccounts = Array.from(accountsPerIP);
            let notUsedInBackground = true;
            for(let i=0;i<targetAccounts.length && notUsedInBackground;i++){
                for(let j=0;j<arrAccounts.length && notUsedInBackground;j++){
                    if(targetAccounts[i] === arrAccounts[j]){
                        notUsedInBackground = false;
                    }
                }
            }
            let strRowsPerTab = '\ntab response length ' + arrAccounts.length + ': \n' + arrAccounts.join('\n');
            let strReveivedMessages = '\nreceived messages length ' + arrReceivedMessages.length + ': \n' + arrReceivedMessages.join('\n');
            log('INFO','received all response for ip ' + msg.ip + ' current status : ' + strRowsPerTab + strReveivedMessages);
            let notUsedItems = receivedTabMessages.filter((v) => {return v.succeeded && v.used === 'N'});
            let ip = receivedTabMessages[0].ip;
            result = await getArrayFromLocalStorage(result,'result');
            let obj = null;
            log('INFO','notUsedItems length ' + notUsedItems.length);
            if(notUsedItems && notUsedItems.length === TABS_NUMBER){
                obj = {ip:ip,used: 'N'};               
            } else{
                obj = {ip:ip,used: 'Y'};
            }
            pushAndSaveArrayToLocalStorage(result,obj,'result');
            // add one only when current ip processed successfully
            allIPIndex++;
            saveNonNegativeInt(allIPIndex,'allIPIndex');
            let resultInBackground = notUsedInBackground ? 'N':'Y';
            log('WARN','used in background ' + resultInBackground + ', used in worker tab ' + obj.used + ' for IP ' + obj.ip);
            strReveivedMessages = '';
            strRowsPerTab = '';
            arrAccounts.length = 0;
            arrReceivedMessages.length = 0;
            log('INFO','cleared resource for ip ' + msg.ip +', begin to process the next ip');
            console.log('cleared resource for ip %s, begin to process the next ip',ip);
            // refresh token for next ip
            await refreshToken();
        }
    });

});

async function refreshToken(){
    // temp begin
    const TOKEN_TAB_URL_PATTERN = 'https://operatornet-midway.cn-northwest-1.amazonaws.cn/console/operator*';
    const TOKEN_TAB_URL_HOME = 'https://operatornet-midway.cn-northwest-1.amazonaws.cn';
    let tokenTabs = await chrome.tabs.query({url:TOKEN_TAB_URL_PATTERN});
    if(tokenTabs.length > 0){
        let tokenTab = tokenTabs[0];
        // tokenTabId = tokenTabId.id;
        console.log('background: found token tab %O and will force to refresh token',tokenTab);
        // log('INFO','background: found token tab ' + tokenTab.id + ' and will force to refresh token');
        chrome.scripting.executeScript({
            target: {tabId: tokenTab.id},
            // files:['fillupIPScripting.js'],
            func: async (refreshTokenHome) =>{
                // force to refresh token. please note, accessing below url will NOT refresh code
                // https://operatornet-midway.cn-northwest-1.amazonaws.cn/console/operator
                // even it's the OperatorNet home page
                // MUST access TOKEN_TAB_URL_HOME to refresh
                window.location.href = refreshTokenHome;
            },
            args:[TOKEN_TAB_URL_HOME]
        });
    } else{        
        try{
            let tokenTab = await chrome.tabs.create({url:TOKEN_TAB_URL_HOME});
            // tokenTabId = tokenTab.id;
            console.warn('background: since no token tab found, created one %O to refresh token',tokenTab);
            log('WARN','background: since no token tab found, created one '+ tokenTab.id +' to refresh token');
        }catch(err){
            console.warn('background: no token tab found, but occurred error %O when establishing',err.stack);
            log.warn('WARN','background: no token tab found, but occurred error '+err.message+' when establishing')
        }                
    }
}

function createSearchInfo(ip,curAccountId,curTargetAccounts){
    receivedTabMessages.length = 0;
    searchInfos.length = 0;
    searchInfoIndex = 0;
    accountsPerIP.clear();
    chrome.storage.local.set({searchInfos:searchInfos});
    const MAX_DATE_RANGE = 180;//180
    // remember to add the slash at the end of url, or it will raise invalid url pattern exception
    const localEndDate = new Date();
    let utcEndDate = Date.UTC(localEndDate.getUTCFullYear(),localEndDate.getUTCMonth(),localEndDate.getUTCDate());
    const MILLISECONDS_OF_179_DAYS = (MAX_DATE_RANGE-1) * 24 * 3600 * 1000;//
    // for production env it should be 432000000: million seconds of 5 days = 5 * 24 * 3600 * 1000;
    const STEP = (MAX_DATE_RANGE / TABS_NUMBER -1) * 24 * 3600 * 1000;
    // for production env it should be 86399000: million seconds of 23:59:59 = 24 * 3600 * 1000 - 1000
    const TIMEPART = 86399000;
    const MILLIONSECONDS_OF_ONE_SECOND = 1000;
    let utcStart = utcEndDate - MILLISECONDS_OF_179_DAYS;
    
    for(let i=1;i < TABS_NUMBER;i++){

        let utcStartPerTab = utcStart;// sample 2022-01-01 00:00:00
        let utcEndPerTab = utcStartPerTab + STEP + TIMEPART; // sample 2022-01-06 23:59:59
        utcStart = utcEndPerTab + MILLIONSECONDS_OF_ONE_SECOND;   
        searchInfos.push({ip:ip,accountId:curAccountId,utcStart:utcStartPerTab,utcEnd:utcEndPerTab,lastTab:false,targetAccounts:curTargetAccounts});
    }

    let lastStartPerTab = utcStart;
    let lastEndPerTab = Date.UTC(localEndDate.getUTCFullYear()
    ,localEndDate.getUTCMonth()
    ,localEndDate.getUTCDate()
    ,localEndDate.getUTCHours()
    ,localEndDate.getUTCMinutes()
    ,localEndDate.getUTCSeconds());

    searchInfos.push({ip:ip,accountId:curAccountId,utcStart:lastStartPerTab,utcEnd:lastEndPerTab,lastTab:true,targetAccounts:curTargetAccounts});
    chrome.storage.local.set({searchInfos:searchInfos});
}

function exportCSV(tabId,items){
    log('INFO','begin to export '+ items.length + ' rows csv data with tab ' + tabId);
    chrome.scripting.executeScript({
        target: {tabId: tabId},
        func: exportCSVFunc,
        args:[items]
    });
    clear();
}

function clear(){
    searchInfos.length = 0;
    searchInfoIndex = 0;
    allIPLen = 0;
    allIP.length = 0;
    allIPIndex = 0;
    targetAccounts.length = 0;
    receivedTabMessages.length = 0;
    logger.length = 0;
    accountId = "";
    accountsPerIP.clear();
    chrome.storage.local.clear();
    chrome.tabs.onRemoved.removeListener(tabRemovedListener);
    chrome.tabs.onUpdated.removeListener(tabOnUpdateListener);
    result.length = 0;
}

/**
 * @param {Array} items the result of ip processed ip
 */
 function exportCSVFunc(items){
    console.log('background: all ip prodcessed ,exporting result',items);
    let csvData = new Array();
    let title = ['ip','used'];
    csvData.push(title.join(',')+'\n');
    items.forEach((v,i,items) => {
        if (v) {
            csvData.push(v.ip+','+v.used+'\n');
        }       
    });
    console.log('background: csv data to export',csvData);
    const blob = new Blob([csvData.join('')], {type : "text/url;charset=utf-8"});
    // const blob = new Blob([csv], {type : "application/x-download;charset=UTF-8"});
    const url = URL.createObjectURL(blob);
    let date = new Date();
    const localYear = date.getFullYear();
    const localMonth = date.getMonth() < 9 ? '0'+(date.getMonth()+1) : ''+(date.getMonth()+1);
    const localDate = date.getDate() < 10 ? '0'+date.getDate():''+ date.getDate();
    const localHour = date.getHours() < 10 ? '0'+date.getHours():''+ date.getHours();
    const localMinute = date.getMinutes() < 10 ? '0'+date.getMinutes():''+ date.getMinutes();
    const localSecond = date.getSeconds() < 10 ? '0'+date.getSeconds():''+ date.getSeconds();
    
    let filename = 'result-'+localYear + localMonth + localDate+localHour + localMinute + localSecond+'.csv';
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    console.log('background: all IP process succeeded and exported to' + filename);
}

/**
 * search ip by date time partition. we splite 180 days into 30 partitions to improve parallelism
 * it also decease the session expiration probabillity
 * @param {object} datePartition sample: {tabId:1,utcStart:15465600000,utcEnd:15465600007,lastTab:true}
 * when if current tab is setup at the last, it will be marked as lastTab:true, or it will be lastTab:false
 */
 function searchByPartitionFunc(datePartition){
    // console.log('background: ip %s, datePartition %O',ip,datePartition);
    let localStart = new Date(datePartition.utcStart);
    let localEnd = new Date(datePartition.utcEnd);
    let tabId = datePartition.tabId;
    let ip = datePartition.ip;
    let lastTab = datePartition.lastTab;
    let accountId = datePartition.accountId;
    let targetAccounts = datePartition.targetAccounts;

    console.log('tabId: %d,local start: %s, local end: %s,ip: %s,lastTab: %s,accountId %s',tabId,localStart,localEnd,ip,lastTab,accountId);
    //account-lookup-by-ip-button
    const FORMAL_SEARCH_BUTTON_CLASS = 'button.awsui-button.awsui-button-variant-primary.awsui-hover-child-icons';                   
    const FORMAL_START_DATE_ID = 'awsui-date-picker-1';
    const FORMAL_START_TIME_ID = 'awsui-time-input-2';
    const FORMAL_END_DATE_ID = 'awsui-date-picker-3';
    const FORMAL_END_TIME_ID = 'awsui-time-input-4';
    const FORMAL_SELECTED_DATE_DIV = 'div.awsui-calendar__date.awsui-calendar__date--current-month.awsui-calendar__date--enabled.awsui-calendar__date--selected';
    const FORMAL_SEARCH_BOX_ID = 'awsui-input-0';
    let textbox = document.getElementById(FORMAL_SEARCH_BOX_ID);
    let btn = document.querySelector(FORMAL_SEARCH_BUTTON_CLASS);
    let startDate = document.getElementById(FORMAL_START_DATE_ID);
    let startTime = document.getElementById(FORMAL_START_TIME_ID);
    let endDate = document.getElementById(FORMAL_END_DATE_ID);
    let endTime = document.getElementById(FORMAL_END_TIME_ID);
    // if textbox is null, which indicates current page is not expected
    // return failed directly, and background will push this ip back into ip list and retry
    const RETRY_TIMES = 3;
    if(textbox == null){
        const message = {accountId:accountId,ip:ip,tabId:tabId,used:true,succeeded:false};
        const localOject = new Object();
        localOject['tab_'+tabId] = message;
        chrome.storage.local.set(localOject);
        window.close();
    }

    // set ip
    textbox.value = ip;
    textbox.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));

    // set start date
    let utcFullYear = localStart.getUTCFullYear();
    let utcFullMonth = localStart.getUTCMonth() < 9 ? '0'+(localStart.getUTCMonth()+1) : ''+(localStart.getUTCMonth()+1);
    let utcFullDate = localStart.getUTCDate() < 10 ? '0'+localStart.getUTCDate():''+ localStart.getUTCDate();
    let utcStartDate = utcFullYear + '/' + utcFullMonth + '/' + utcFullDate;
    console.log('background: utc start date',utcStartDate);
    
    // since startDate and endDate are aws developed react control, it doesn't expose
    // any api for native js. To set react control value correctly,we have to simulate manual
    // operation completely:
    // 1. set the value as expected
    // 2. dispatch input event to the control, this action guarantee react control recognize its state changed
    // 3. dispatch click event to selected date div, this action guarantee dismiss the pop window properly
    // please note: 
    // 1. it's required to dispatch input event to the date picker control to textbox
    // 2. it's required to locate the selected date html element
    startDate.value = utcStartDate;
    startDate.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));
    let selectedStartDate = document.querySelector(FORMAL_SELECTED_DATE_DIV);
    if(selectedStartDate) selectedStartDate.click();
    
    //set start time
    let utcHours = localStart.getUTCHours() < 10 ? '0'+localStart.getUTCHours() : ''+localStart.getUTCHours();
    let utcMinutes = localStart.getUTCMinutes() < 10 ? '0'+localStart.getUTCMinutes() : ''+localStart.getUTCMinutes();
    let utcSeconds = localStart.getUTCSeconds() < 10 ? '0'+localStart.getUTCSeconds() : ''+localStart.getUTCSeconds();
    let utcStartTime = utcHours + ':' + utcMinutes +':'+ utcSeconds;
    startTime.value = utcStartTime;
    // startTime.dispatchEvent(new Event('blur',{bubbles:true,cancelable:true}));
    console.log('background: utc start time %s',utcStartTime);
    
    // set end date
    // same comments as start date
    utcFullYear = localEnd.getUTCFullYear();
    utcFullMonth = localEnd.getUTCMonth() < 9 ? '0'+(localEnd.getUTCMonth()+1) : ''+(localEnd.getUTCMonth()+1);
    utcFullDate = localEnd.getUTCDate() < 10 ? '0'+localEnd.getUTCDate():''+ localEnd.getUTCDate();
    let utcEndDate = utcFullYear + '/' + utcFullMonth + '/' + utcFullDate;
    
    endDate.value = utcEndDate;
    endDate.dispatchEvent(new Event('input',{bubbles:true,cancelable:true}));
    let selectedEndDate = document.querySelector(FORMAL_SELECTED_DATE_DIV);
    if(selectedEndDate) selectedEndDate.click();
    console.log('background: utc end date %s',utcEndDate);
    
    //set end time
    utcHours = localEnd.getUTCHours() < 10 ? '0'+localEnd.getUTCHours() : ''+localEnd.getUTCHours();
    utcMinutes = localEnd.getUTCMinutes() < 10 ? '0'+localEnd.getUTCMinutes() : ''+localEnd.getUTCMinutes();
    utcSeconds =  localEnd.getUTCSeconds() < 10 ? '0'+localEnd.getUTCSeconds() : ''+localEnd.getUTCSeconds();
    let utcEndTime = utcHours + ':' + utcMinutes +':'+ utcSeconds;
    endTime.value = utcEndTime;
    console.log('background: utc end time %s',utcEndTime);

    btn.click();
    const ERROR_DIV_CLASS = 'div.awsui-alert.awsui-alert-type-error'; 
    const SCAN_INTERVAL = 2000;
    const FORMAL_LOADING_TAG = 'awsui-spinner';
    const PAGE_BUTTON = 'li.awsui-table-pagination-page-number button';
    let scanStartTime = Date.now();
    const MILLIONSECONDS_OF_10_MINUTES = 600000; // 10 minutes 1000 * 60 * 10 milliseconds for production environment
    let retryForError = 0;
    let port = chrome.runtime.connect({name:'tab_'+tabId});
    let interval = setInterval(() => {
        let errorDiv = document.querySelector(ERROR_DIV_CLASS);
        let loadingTag = document.querySelector(FORMAL_LOADING_TAG);
        if(errorDiv){
            retryForError++;
            console.log('tab %d: occurred error, retring...',tabId);
            btn.click();
            if(retryForError > RETRY_TIMES){
                clearInterval(interval);
                const message = {accountId:accountId,ip:ip,tabId:tabId,used:true,succeeded:false};
                
                try{
                    port.postMessage(message);
                    console.log('tab %d: found some error, consider current tab processed failed ,sent message %O',message);
                    window.close();
                }catch(err){
                    let retry = 0;
                    let retryInterval = setInterval(()=>{
                        if(retry > 2){
                            clearInterval(retryInterval);
                            console.log('tab %d: there still has error %O after retring 3 times',tabId,err);
                        }else{
                            try{
                                let retryPort = chrome.runtime.connect({name:'tab_'+tabId});
                                retryPort.postMessage(message);
                                clearInterval(retryInterval);
                                console.log('tab %d: collected response successfully after retry ,sent message %O',tabId,message);
                                window.close();
                            } catch(e){
                                retry++;
                            }
                        }
                        
                    },SCAN_INTERVAL);
                }
            }
        }else{
            if(loadingTag){
                let currentTime = Date.now();
                if(currentTime - scanStartTime >= MILLIONSECONDS_OF_10_MINUTES){
                    clearInterval(interval);
                    const message = {accountId:accountId,ip:ip,tabId:tabId,used:true,succeeded:false};
                    try{
                        port.postMessage(message);
                        console.log('tab %d: timed out, consider current tab processed failed ,sent message %O',message);
                        window.close();
                    }catch(err){
                        let retry = 0;
                        let retryInterval = setInterval(()=>{
                            if(retry > 2){
                                clearInterval(retryInterval);
                                console.log('tab %d: there still has error %O after retring 3 times',tabId,err);
                            }else{
                                try{
                                    let retryPort = chrome.runtime.connect({name:'tab_'+tabId});
                                    retryPort.postMessage(message);
                                    clearInterval(retryInterval);
                                    console.log('tab %d: collected response successfully after retry ,sent message %O',tabId,message);
                                    window.close();
                                } catch(e){
                                    retry++;
                                }
                            }
                            
                        },SCAN_INTERVAL);
                    }
                }
            }else{
                clearInterval(interval);
                let rows = new Array();
                let pageButtons = document.querySelectorAll(PAGE_BUTTON);
            
                pageButtons.forEach((v,k,pageButtons) => {
                    if(k > 0){
                        v.click();
                    }
                    let trList = document.querySelectorAll('table[role=table] tbody tr');                 
                    if(trList && trList.length > 0){   
                        let len = trList.length;                                  
                        for(let i=0;i<len-1;i++){
                            rows.push(trList[i].cells[0].innerText);
                        }
                        let lastRealId = trList[len-1].cells[0].innerText;
                        if(!lastRealId.startsWith('No')){
                            if(lastTab){
                                // do additional check for last one of trList
                                if(lastRealId != accountId){
                                    rows.push(lastRealId);
                                }
                            }else{
                                rows.push(lastRealId);
                            }
                        }
                    }
                });
                console.log('tab %d: found items %O',tabId,rows);
                let notUsed = true;
                for(let i=0;i<rows.length && notUsed;i++){
                    for(let j=0;j<targetAccounts.length && notUsed;j++){
                        if(rows[i] === targetAccounts[j]){
                            notUsed = false;
                        }
                    }
                }
                let flag = notUsed? 'N':'Y';
                const message = {accountId:accountId,ip:ip,tabId:tabId,used:flag,succeeded:true,rows:rows};
                try{
                    port.postMessage(message);
                    console.log('tab %d: collected response successfully ,sent message %O',tabId,message);
                    window.close();
                }catch(err){
                    let retry = 0;
                    let retryInterval = setInterval(()=>{
                        if(retry > 2){
                            clearInterval(retryInterval);
                            console.log('tab %d: there still has error %O after retring 3 times',tabId,err);
                        }else{
                            try{
                                let retryPort = chrome.runtime.connect({name:'tab_'+tabId});
                                retryPort.postMessage(message);
                                clearInterval(retryInterval);
                                console.log('tab %d: collected response successfully after retry ,sent message %O',tabId,message);
                                window.close();
                            } catch(e){
                                retry++;
                            }
                        }
                        
                    },SCAN_INTERVAL);
                }
            }
        }
    }, SCAN_INTERVAL);
}

// belows are utils methods

/**
 * simulating Thread.sleep via while loop
 * @param {Numeric} delay 
 */
 function delayCounter(delay){
    while(delay > 0){
        delay--;
    }
}

function log(level,msg){
    let date = new Date();
    const localYear = date.getFullYear();
    const localMonth = date.getMonth() < 9 ? '0'+(date.getMonth()+1) : ''+(date.getMonth()+1);
    const localDate = date.getDate() < 10 ? '0'+date.getDate():''+ date.getDate();
    const localHour = date.getHours() < 10 ? '0'+date.getHours():''+ date.getHours();
    const localMinute = date.getMinutes() < 10 ? '0'+date.getMinutes():''+ date.getMinutes();
    const localSecond = date.getSeconds() < 10 ? '0'+date.getSeconds():''+ date.getSeconds();
    const localMillionSeconds = date.getMilliseconds();
    const now = localYear + '-' + localMonth + '-' + localDate + ' ' + localHour + ':' + localMinute + ':' + localSecond + '.' + localMillionSeconds;

    logger.push(now + ' ' + level + ' ' + msg + '\r');
    chrome.storage.local.set({logs:logger});
}

/**
 * in case of data missing ,we persist key objects in local storage
 * so when retrieving object, you can call this message
 * @returns object
 */
 async function getArrayFromLocalStorage(listObj,objKey){
    if(listObj && listObj.length > 0){
        return listObj;
    }
    let localObj = await chrome.storage.local.get(objKey);
    if(localObj && localObj[objKey]){      
        try{
            return localObj[objKey];
        }
        catch(err){
            console.warn('background: when retrieving list object %O from local storage occurred error %O,returned new list',localObj[objKey],err.stack);
            log('WARN','background: when retrieving list object '+ localObj[objKey] +' from local storage occurred error '+err.message+',returned empty list');
            return new Array();
        }
    }
    return new Array();
}

function pushAndSaveArrayToLocalStorage(listObj,newItem,objKey){
    listObj.push(newItem);
    let obj = new Object();
    obj[objKey] = listObj;
    chrome.storage.local.set(obj);
}

function popAndSaveArrayToLocalStorage(listObj,objKey){
    if(listObj && listObj.length > 0){
        let item = listObj.pop();
        let obj = new Object();
        obj[objKey] = listObj;
        chrome.storage.local.set(obj);
        return item;
    }
    return null;
}

async function getNonNegativeInt(int,objKey){
    if(int > 0) return int;
    let localInt = await chrome.storage.local.get(objKey);
    if(localInt[objKey]){
        try{
            return parseInt(localInt[objKey]);
        }catch(err){
            log('WARN','background: when retrieving non-negative interger '+ localObj[objKey] +' from local storage occurred error '+err.message+',returned 0');
            return 0;
        }
    }else{
        return 0;
    }
}

function saveNonNegativeInt(int,objKey){
    let obj = new Object();
    obj[objKey] = int;
    chrome.storage.local.set(obj);
}
