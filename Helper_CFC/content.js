// CF Companion - Problem/Contest Extractor + Submit Poller
(function () {
    'use strict';

//---------------------WebSocket / Background communication-----------------------------

    function send(data){
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'ws_send', data }, () => resolve());
        });
    }

    function bgMessage(msg){
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(msg, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(response);
            });
        });
    }

//--------------------Generic helpers--------------------------

    function fetchPage(url){
        return fetch(url, { credentials: 'include' }).then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
            return res.text();
        });
    }

    function parseHTML(html){
        return new DOMParser().parseFromString(html, 'text/html');
    }

    function cleanText(text){
        return text
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n\s*\n\s*\n+/g, '\n\n')
            .trim();
    }

    function cssEscape(value){
        return window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
    }

    function base64ToBytes(b64){
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function getLoggedInHandle(){
        const link = document.querySelector('#header a[href^="/profile/"]');
        return link ? link.textContent.trim() : null;
    }

//-----------------------Handle storage (persists across page reloads via sessionStorage)-----------------------

    const HANDLE_STORAGE_KEY = 'cfCompanion.handle';

    function storeHandle(handle){
        if(!handle) return;
        try{
            sessionStorage.setItem(HANDLE_STORAGE_KEY, handle);
        } 
        catch (err){
            console.error('[CFC DEBUG] Could not store handle:', err);
        }
    }

    function getStoredHandle(){
        try{
            return sessionStorage.getItem(HANDLE_STORAGE_KEY);
        }
        catch(err){
            return null;
        }
    }

    function handlesMatch(expectedHandle, actualHandle){
        if(!expectedHandle || !actualHandle) return false;
        return expectedHandle.toLowerCase() === actualHandle.toLowerCase();
    }

//---------------------Problem extractor---------------------------------------------

    function extractPreLines(pre) {
        if (!pre) return '';
        const clone = pre.cloneNode(true);
        clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
        Array.from(clone.children).forEach((child) => {
            if (child.tagName === 'DIV') child.insertAdjacentText('afterend', '\n');
        });
        const text = clone.textContent || '';
        return text
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '')
            .replace(/\n{2,}/g, '\n')
            .replace(/\n+$/, '')
            .trim();
    }

    function sanitizeStatementHtml(root, baseUrl){
        const dangerousSelectors = [
            'script', 'style', 'noscript', 'iframe', 'object', 'embed',
            'form', 'input', 'button', 'textarea', 'select', 'option', 'link',
        ];

        root.querySelectorAll(dangerousSelectors.join(',')).forEach((element) => element.remove());

        root.querySelectorAll('*').forEach((element) => {
            for(const attr of Array.from(element.attributes)){
                const name = attr.name.toLowerCase();
                const value = attr.value || '';

                if(name.startsWith('on')){
                    element.removeAttribute(attr.name);
                    continue;
                }
                if(name === 'href' || name === 'src'){
                    if(/^\s*javascript:/i.test(value) || /^\s*data:/i.test(value)){
                        element.removeAttribute(attr.name);
                        continue;
                    }
                    try{
                        element.setAttribute(attr.name, new URL(value, baseUrl).href);
                    } 
                    catch{
                        element.removeAttribute(attr.name);
                    }
                    continue;
                }

                if(name === 'srcset'){
                    element.removeAttribute(attr.name);
                }
            }
            if(element.tagName.toLowerCase() === 'a'){
                element.setAttribute('target', '_blank');
                element.setAttribute('rel', 'noopener noreferrer');
            }
        });

        return root.innerHTML;
    }

    function getStatementHtml(statement, url){
        const clone = statement.cloneNode(true);
        const removeSelectors = [
            '.header', '.title', '.time-limit', '.memory-limit',
            '.input-file', '.output-file', '.sample-tests',
        ];
        removeSelectors.forEach((selector) => {
            clone.querySelectorAll(selector).forEach((element) => element.remove());
        });
        return sanitizeStatementHtml(clone, url);
    }

    function getContestId(url = location.href){
        const contestMatch = url.match(/\/contest\/(\d+)/);
        if(contestMatch) return contestMatch[1];

        const gymMatch = url.match(/\/gym\/(\d+)/);
        if(gymMatch) return gymMatch[1];

        const problemsetMatch = url.match(/\/problemset\/problem\/(\d+)\/[^/?#]+/i);
        if(problemsetMatch) return problemsetMatch[1];

        return null;
    }

    function getProblemCodeFromUrl(url){
        const contestMatch = url.match(/\/(?:contest|gym)\/\d+\/problem\/([^/?#]+)/i);
        if(contestMatch) return contestMatch[1];

        const problemsetMatch = url.match(/\/problemset\/problem\/\d+\/([^/?#]+)/i);
        if(problemsetMatch) return problemsetMatch[1];
        return '';
    }

    function getProblemName(statement){
        const title = statement.querySelector('.title');
        if(!title) return '';
        return cleanText(title.textContent);
    }

    function getProblemCode(statement, url){
        const title = statement.querySelector('.title');
        if(title){
            const text = cleanText(title.textContent);
            const match = text.match(/^([A-Za-z0-9]+)\./);
            if(match) return match[1];
        }
        return getProblemCodeFromUrl(url);
    }

    function getLimits(statement){
        const timeElement = statement.querySelector('.time-limit');
        const memoryElement = statement.querySelector('.memory-limit');
        return{
            time_limit: timeElement
                ? cleanText(timeElement.textContent).replace(/^time limit\s*/i, '').replace(/^per test\s*/i, '').trim() : '',
            memory_limit: memoryElement
                ? cleanText(memoryElement.textContent).replace(/^memory limit\s*/i, '').replace(/^per test\s*/i, '').trim() : '',
        };
    }

    function getTags(document){
        return Array.from(document.querySelectorAll('.problem-statement .tag-box')).map((tag) => cleanText(tag.textContent));
    }

    function getSamples(statement){
        const sampleTests = statement.querySelector('.sample-tests');
        if(!sampleTests) return [];

        const inputs = Array.from(sampleTests.querySelectorAll('.input'));
        const outputs = Array.from(sampleTests.querySelectorAll('.output'));
        const count = Math.max(inputs.length, outputs.length);
        const samples = [];

        for(let i = 0;i < count;i++){
            const inputPre = inputs[i]?.querySelector('pre');
            const outputPre = outputs[i]?.querySelector('pre');
            samples.push({
                index: i + 1,
                input: extractPreLines(inputPre),
                output: extractPreLines(outputPre),
            });
        }
        return samples;
    }

    function extractProblem(document, url){
        const statement = document.querySelector('.problem-statement');
        if(!statement) return null;

        const contestId = getContestId(url);
        const problemCode = getProblemCode(statement, url);
        const problemName = getProblemName(statement);
        const limits = getLimits(statement);
        const tags = getTags(document);
        const statementHtml = getStatementHtml(statement, url);
        const samples = getSamples(statement);

        return{
            type: 'problem',
            contest_id: contestId,
            problem_code: problemCode,
            problem_name: problemName,
            url,
            time_limit: limits.time_limit,
            memory_limit: limits.memory_limit,
            tags,
            statement_html: statementHtml,
            samples,
            timestamp: Date.now(),
        };
    }

//------------------------Contest extractor-----------------------------------

    function getContestName(document){
        const selectors = ['.contest-name', '.rtable .left', '.title'];

        for(const selector of selectors){
            const element = document.querySelector(selector);
            if(element){
                const text = cleanText(element.textContent);
                if (text) return text;
            }
        }
        return document.title.replace(/\s*-\s*Codeforces.*$/i, '').trim();
    }

    function getContestProblems(document){
        const problems = [];
        const seen = new Set();
        const anchors = document.querySelectorAll('a[href*="/problem/"]');

        anchors.forEach((anchor) => {
            const href = anchor.href;
            if (!href) return;

            const match = href.match(/\/(?:contest|gym)\/(\d+)\/problem\/([^/?#]+)/i);
            if (!match) return;

            const contestId = match[1];
            const problemCode = match[2];
            const currentContest = getContestId();

            if (currentContest && contestId !== currentContest) return;

            const key = `${contestId}/${problemCode}`;
            if (seen.has(key)) return;
            seen.add(key);
            problems.push({ contest_id: contestId, problem_code: problemCode, url: href });
        });
        return problems;
    }

    async function processProblem(url, index, total){
        try{
            const html = await fetchPage(url);
            const document = parseHTML(html);
            const problem = extractProblem(document, url);
            if (!problem) throw new Error('Problem statement not found');
            await send(problem);
            return true;
        } 
        catch(error){
            console.error('[CF Companion] Failed:', url, error);

            await send({
                type: 'problem_error',
                contest_id: getContestId(url),
                problem_code: getProblemCodeFromUrl(url),
                url,
                error: error?.message || String(error),
                timestamp: Date.now(),
            });

            return false;
        }
    }

    async function processContest(){
        const contestId = getContestId();
        if (!contestId) return;

        const contestName = getContestName(document);
        const problems = getContestProblems(document);

        await send({
            type: 'contest_metadata',
            contest_id: contestId,
            name: contestName,
            url: location.href,
            problem_count: problems.length,
            timestamp: Date.now(),
        });

        let successful = 0;

        for(let i = 0; i < problems.length; i++){
            const success = await processProblem(problems[i].url, i + 1, problems.length);
            if (success) successful++;
        }

        await send({
            type: 'contest_complete',
            contest_id: contestId,
            name: contestName,
            problem_count: problems.length,
            successful,
            failed: problems.length - successful,
            timestamp: Date.now(),
        });
    }

    async function processSingleProblem(){
        await processProblem(location.href, 1, 1);
    }

    function isContestPage(){
        return /^\/(?:contest|gym)\/\d+\/?$/.test(location.pathname);
    }

    function isProblemPage(){
        return (
            /\/(?:contest|gym)\/\d+\/problem\//i.test(location.pathname) ||
            /\/problemset\/problem\//i.test(location.pathname)
        );
    }

    async function processPage() {
        try{
            if(isContestPage()){
                await processContest();
            } 
            else if(isProblemPage()){
                await processSingleProblem();
            }
        } 
        catch(error){
            console.error('[CF Companion] Processing failed:', error);
        }
    }

//-------------------Extractor UI---------------------------------------------------------

    let cfcButton = null;

    async function runProcessPageWithUi() {
        if(!cfcButton){
            await processPage();
            return;
        }

        cfcButton.textContent = '...';
        showStatusToast('Parsing problem…', 'loading');

        try{
            await processPage();
            cfcButton.textContent = '✓';
            showStatusToast('Sent — loading in VS Code…', 'loading');
        } 
        catch{
            cfcButton.textContent = '✕';
            showStatusToast('Failed to parse problem', 'error');
        }

        setTimeout(() => {
            cfcButton.textContent = 'CFC';
        }, 1500);
    }

    function createButton(){
        const button = document.createElement('button');
        cfcButton = button;

        button.textContent = 'CFC';
        button.title = 'Send to CF Companion';

        Object.assign(button.style, {
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: '999999',
            padding: '6px 12px',
            background: '#1a1a2e',
            color: '#e8e8e8',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            letterSpacing: '0.2px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            opacity: '0.9',
            transition: 'opacity 0.15s ease, transform 0.1s ease',
        });

        button.addEventListener('mouseenter', () => { button.style.opacity = '1'; });
        button.addEventListener('mouseleave', () => { button.style.opacity = '0.9'; });
        button.addEventListener('mousedown', () => { button.style.transform = 'scale(0.97)'; });
        button.addEventListener('mouseup', () => { button.style.transform = 'scale(1)'; });
        button.addEventListener('click', runProcessPageWithUi);

        document.body.appendChild(button);
    }

    let toastElement = null;
    let toastHideTimer = null;

    function ensureToastElement(){
        if (toastElement && document.body.contains(toastElement)) return toastElement;

        const el = document.createElement('div');

        Object.assign(el.style, {
            position: 'fixed',
            bottom: '52px',
            right: '16px',
            zIndex: '999999',
            padding: '5px 10px',
            background: '#1a1a2e',
            color: '#e8e8e8',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '5px',
            fontSize: '11px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            letterSpacing: '0.2px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: '0',
            transition: 'opacity 0.15s ease',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
        });

        const dot = document.createElement('span');
        dot.className = 'cfc-toast-dot';
        Object.assign(dot.style, {
            width: '6px', height: '6px', borderRadius: '50%',
            background: '#4caf50', flexShrink: '0',
        });

        const label = document.createElement('span');
        label.className = 'cfc-toast-label';
        el.appendChild(dot);
        el.appendChild(label);
        document.body.appendChild(el);
        toastElement = el;
        return el;
    }

    function showStatusToast(text, kind, autoHideMs) {
        const el = ensureToastElement();
        const dot = el.querySelector('.cfc-toast-dot');
        const label = el.querySelector('.cfc-toast-label');

        label.textContent = text;

        if(kind === 'error'){
            dot.style.background = '#e05555';
            dot.style.animation = 'none';
        } 
        else if(kind === 'success'){
            dot.style.background = '#4caf50';
            dot.style.animation = 'none';
        } 
        else{
            dot.style.background = '#e0a855';
            dot.style.animation = 'cfc-toast-pulse 1s ease-in-out infinite';

            if(!document.getElementById('cfc-toast-pulse-style')){
                const style = document.createElement('style');
                style.id = 'cfc-toast-pulse-style';
                style.textContent = '@keyframes cfc-toast-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }';
                document.head.appendChild(style);
            }
        }

        el.style.opacity = '1';

        if(toastHideTimer){
            clearTimeout(toastHideTimer);
            toastHideTimer = null;
        }

        if(autoHideMs){
            toastHideTimer = setTimeout(() => { el.style.opacity = '0'; }, autoHideMs);
        }
    }

    function hideStatusToast(){
        if (!toastElement) return;
        toastElement.style.opacity = '0';
    }

    function isExtractorPage(){
        return isContestPage() || isProblemPage();
    }

    function initExtractor(){
        createButton();
    }

//------------------Message From Background-----------------------------------------------

    chrome.runtime.onMessage.addListener((msg) => {
        console.log('[CFC DEBUG] MESSAGE RECEIVED:', msg);

        if(msg && msg.type === 'run_process_page'){
            runProcessPageWithUi();
        }

        if(msg && msg.type === 'ws_message' && msg.data && msg.data.type === 'problem_loaded'){
            const loaded = msg.data;
            showStatusToast(`Loaded ${loaded.contest_id}${loaded.problem_code} in VS Code`, 'success', 2500);
        }

        if(msg && msg.type === 'ws_message' && msg.data && msg.data.type === 'configured_handle'){
            console.log('[CFC DEBUG] RECEIVED CONFIGURED HANDLE', msg.data.handle);
            storeHandle(msg.data.handle);
            console.log('[CFC DEBUG] stored handle NOW =', getStoredHandle());
        }
        if(msg && msg.type === 'ws_message' && msg.data && msg.data.type === 'request_submissions_scrape'){
            console.log('[CFC DEBUG] REQUEST SCRAPE RECEIVED', msg.data);

            // Match against the handle carried by THIS request, not a stale cached one.
            const requestHandle = msg.data.handle || getStoredHandle();

            if(msg.data.handle){
                storeHandle(msg.data.handle);
                console.log('[CFC DEBUG] HANDLE SET FROM REQUEST:', requestHandle);
            }
            scrapeOnceOnLoad();
        }

        if(msg && msg.type === 'ws_message' && msg.data && msg.data.type === 'vscode_connected'){
            console.log('[CFC DEBUG] VSCODE CONNECTED');
            scrapeOnceOnLoad();
        }
        return false;
    });

    
//--------------------Submit Poller---------------------------------------------------------
    const SUBMIT_POLL_INTERVAL_MS = 1000;
    let submitInFlight = false;

    async function pollSubmitOnce() {
        if(submitInFlight) return;
        let response;
        try{
            response = await bgMessage({ type: 'submit_poll' });
        } 
        catch(err){
            return;
        }
        if (!response || !response.ok) return;
        const job = response.body && response.body.job;
        if (!job) return;
        const loggedInHandle = getLoggedInHandle();
        if(job.expectedHandle && !handlesMatch(job.expectedHandle, loggedInHandle)){
            return;
        }

        submitInFlight = true;
        try{
            const message = await runSubmitJob(job);
            await reportSubmitResult(job.jobId, true, message);
        } 
        catch(err){
            console.error('[CF Companion] Submit job failed:', err);
            await reportSubmitResult(job.jobId, false, err && err.message ? err.message : String(err));
        } 
        finally{
            submitInFlight = false;
        }
    }

    async function reportSubmitResult(jobId, ok, message){
        try{
            await bgMessage({ type: 'submit_result', jobId, resultOk: ok, message });
        } 
        catch(err) {}
    }

    async function runSubmitJob(job){
        if (location.href.replace(/\/$/, '') !== job.submitUrl.replace(/\/$/, '')) {
            location.href = job.submitUrl;
            return new Promise(() => {});
        }

        assertLoggedIn();
        selectProblem(job);
        selectCompiler(job.compiler);
        attachFile(job.fileName, job.fileContentBase64);

        if(job.dryRun){
            return (
                `Dry run: form filled and file attached for ` +
                `${job.contestId}${job.problemCode}. ` +
                `Submit was not clicked.`
            );
        }

        
        markPendingPoll(job.contestId, job.problemCode, job.expectedHandle);
        await clickSubmit();
        return `Submitted ${job.contestId}${job.problemCode} (${job.compiler}).`;
    }

    function assertLoggedIn(){
        if(/\/enter(\?|$)/i.test(location.pathname)){
            throw new Error('Not logged into Codeforces in this tab. Please log in, then try Submit again.');
        }
    }

    function selectProblem(job){
        const problemCode = job.problemCode;
        const select = document.querySelector('select[name="submittedProblemIndex"]');

        if(select){
            const byValue = select.querySelector(`option[value="${cssEscape(problemCode)}"]`);

            if(byValue){
                select.value = problemCode;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }

            const options = Array.from(select.options);
            const match = options.find((o) =>
                o.textContent.trim().toUpperCase().startsWith(problemCode.trim().toUpperCase())
            );

            if(!match){
                throw new Error(
                    `Could not find problem "${problemCode}" in the submit page's problem list. Available options: ${
                        options.map((o) => o.textContent.trim()).join(', ') || '(none)'
                    }.`
                );
            }
            select.value = match.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }

        const textInput =
            document.querySelector('input[name="submittedProblemCode"]') ||
            document.querySelector('input[name="submittedProblemIndex"]');

        if(!textInput){
            throw new Error('Could not find the problem selector on the submit page.');
        }

        const fullCode = job.contestId ? `${job.contestId}${problemCode}` : problemCode;

        textInput.value = fullCode;
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        textInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function selectCompiler(compiler) {
        const select = document.querySelector('select[name="programTypeId"]');
        if(!select){
            throw new Error('Could not find the compiler/language selector on the submit page.');
        }

        const options = Array.from(select.options);
        let match = options.find((o) => o.textContent.trim() === compiler.trim());

        if(!match){
            match = options.find((o) => o.textContent.toLowerCase().includes(compiler.toLowerCase()));
        }

        if(!match){
            throw new Error(
                `Could not find compiler "${compiler}" in the submit page's language list. Available options: ${
                    options.map((o) => o.textContent.trim()).join(', ')
                }.`
            );
        }
        select.value = match.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function attachFile(fileName, base64Content) {
        const input = document.querySelector('input[type="file"][name="sourceFile"]');
        if(!input){
            throw new Error('Could not find the file upload field on the submit page.');
        }

        const bytes = base64ToBytes(base64Content);
        const file = new File([bytes], fileName, { type: 'text/plain' });
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const SUBMIT_BUTTON_WAIT_MS = 3000;
    const SUBMIT_BUTTON_POLL_INTERVAL_MS = 100;

    function waitForSubmitButtonEnabled(button, timeoutMs){
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if(!button.disabled){
                    resolve();
                    return;
                }
                if(Date.now() - start >= timeoutMs){
                    reject(new Error(
                        `Submit button stayed disabled for ${timeoutMs}ms after filling the form. ` +
                        `Codeforces' own validation likely rejected one of the fields (problem, language,or file).`
                    ));
                    return;
                }
                setTimeout(check, SUBMIT_BUTTON_POLL_INTERVAL_MS);
            };
            check();
        });
    }

    async function clickSubmit(){
        const button = document.querySelector('input[type="submit"][value="Submit"]');
        if(!button){
            throw new Error('Could not find the Submit button on the submit page.');
        }
        if(button.disabled){
            await waitForSubmitButtonEnabled(button, SUBMIT_BUTTON_WAIT_MS);
        }
        button.click();
    }

//-------------Submission Scrapper------------------------------------------------------

    const SUBMISSIONS_SCRAPE_MAX_ROWS = 50;
    const POST_SUBMIT_POLL_INTERVAL_MS = 5000;
    const POST_SUBMIT_MAX_ATTEMPTS = 15;

    function isSubmissionsPage() {
        return (/\/(?:submissions|status)(\/|$)/i.test(location.pathname) || /\/my\/?$/i.test(location.pathname));
    }

    function mapVerdictText(text) {
        const t = cleanText(text || '').toLowerCase();
        if(!t) return null;

        if(t.includes('in queue') || t.includes('running') || t.includes('judging')) return 'TESTING';
        if(t.includes('pretest passed') || t.includes('pretests passed')) return 'PRETEST PASSED';
        if(t.startsWith('accepted')) return 'OK';
        if(t.startsWith('wrong answer')) return 'WRONG_ANSWER';
        if(t.startsWith('time limit exceeded')) return 'TIME_LIMIT_EXCEEDED';
        if(t.startsWith('memory limit exceeded')) return 'MEMORY_LIMIT_EXCEEDED';
        if(t.startsWith('idleness limit exceeded')) return 'IDLENESS_LIMIT_EXCEEDED';
        if(t.startsWith('runtime error')) return 'RUNTIME_ERROR';
        if(t.startsWith('compilation error')) return 'COMPILATION_ERROR';
        if(t.startsWith('presentation error')) return 'PRESENTATION_ERROR';
        if(t.startsWith('security violated')) return 'SECURITY_VIOLATED';
        if(t.startsWith('crashed')) return 'CRASHED';
        if(t.startsWith('denial of judgement') || t.includes('failed')) return 'FAILED';
        if(t.startsWith('partial')) return 'PARTIAL';
        if(t.startsWith('hacked')) return 'HACKED';
        if(t.startsWith('skipped')) return 'SKIPPED';
        if(t.startsWith('rejected')) return 'REJECTED';
        if(t.startsWith('challenged')) return 'CHALLENGED';
        return null;
    }

    const NON_FINAL_VERDICTS = new Set(['TESTING', 'SUBMITTED', 'QUEUED', 'COMPILING', 'RUNNING']);

    function isPendingVerdict(verdict) {
        return NON_FINAL_VERDICTS.has(verdict);
    }

    function extractRowHandle(row){
        const profileAnchor = row.querySelector('a[href^="/profile/"]');
        if(!profileAnchor) return null;
        const href = profileAnchor.getAttribute('href') || '';
        const match = href.match(/^\/profile\/([^/?#]+)/i);
        if(match) return decodeURIComponent(match[1]);
        return cleanText(profileAnchor.textContent) || null;
    }

    function extractRow(row, expectedHandle = null) {
        if(expectedHandle){
            const rowHandle = extractRowHandle(row);
            if(!handlesMatch(expectedHandle, rowHandle)) return null;
        }

        const verdictCell =
            row.querySelector('.submissionVerdictWrapper') ||
            row.querySelector('[waiter="submissionVerdict"]') ||
            row.querySelector('td.status-verdict-cell') ||
            row.querySelector('td.verdict-accepted, td.verdict-rejected, td.verdict-waiting');

        if(!verdictCell) return null;

        const verdict = mapVerdictText(verdictCell.textContent);
        if(!verdict) return null;
        
        const problemAnchor = row.querySelector('a[href*="/problem/"]');
        if(!problemAnchor) return null;

        const href = problemAnchor.getAttribute('href') || '';
        let match = href.match(/\/(?:contest|gym)\/(\d+)\/problem\/([^/?#]+)/i);

        if(!match){
            match = href.match(/\/problemset\/problem\/(\d+)\/([^/?#]+)/i);
        }
        if(!match) return null;
        const contestId = match[1];
        const problemCode = match[2];
        const problemName = cleanText(problemAnchor.textContent).replace(/^[A-Za-z0-9]+\s*[-.]\s*/, '');
        let submissionTimeMs;
        const timeCell =
            row.querySelector('.format-time') ||
            row.querySelector('td:nth-child(2)');

        if(timeCell){
            const title = timeCell.getAttribute('title');
            let timeText = title;
            if(!timeText){
                timeText = [...timeCell.childNodes]
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent)
                    .join('')
                    .trim();
            }
            const parsed = Date.parse(timeText);
            if(!Number.isNaN(parsed)){
                submissionTimeMs = parsed;
            }
        }

        const submissionId =
            row.getAttribute('data-submission-id') ||
            row.querySelector('[submissionid]')?.getAttribute('submissionid') ||
            null;

        return {
            contestId,
            problemCode,
            verdict,
            problemName,
            submissionTimeMs,
            submissionId
        };
    }

    function scrapeSubmissionsTable(expectedHandle = null){
        const table = document.querySelector('table.status-frame-datatable');
        if(!table) return [];

        const domRows = Array.from(table.querySelectorAll('tr'));
        const results = [];
        for(const row of domRows){
            const extracted = extractRow(row, expectedHandle);
            if(extracted){
                results.push(extracted);
            }
            if(results.length >= SUBMISSIONS_SCRAPE_MAX_ROWS) break;
        }
        return results;
    }

    function rowsContainExpectedSubmission(rows, expected){
        if (!expected) return true;

        return rows.some((row) => {
            if (String(row.contestId) !== String(expected.contestId)) return false;
            if (String(row.problemCode).toUpperCase() !== String(expected.problemCode).toUpperCase()) return false;
            return true;
        });
    }

    async function scrapeSubmissionsIfRelevant(force = false, expectedSubmission = null, handle = null) {
        const requestHandle = handle || getStoredHandle();
        console.log('[CFC DEBUG] SCRAPE FUNCTION CALLED', {
            force,
            url: location.href,
            pathname: location.pathname,
            isSubmissionsPage: isSubmissionsPage(),
            requestHandle,
            expectedSubmission,
        });

        if(!isSubmissionsPage()){
            console.log('[CFC DEBUG] NOT SUBMISSIONS PAGE');
            return [];
        }
        if(!requestHandle){
            console.log('[CFC DEBUG] NO HANDLE TO MATCH AGAINST');
            return [];
        }
        const loggedInHandle = getLoggedInHandle();
        
        console.log('[CFC DEBUG] HANDLES', { requestHandle, loggedInHandle });
        
        if (!handlesMatch(requestHandle, loggedInHandle)) {
            console.log('[CFC DEBUG] HANDLE MISMATCH');
            return [];
        }
        const rows = scrapeSubmissionsTable(requestHandle);

        console.log('[CFC DEBUG] EXTRACTED ROW COUNT:', rows.length);
        
        if(rows.length){
            console.log('[CFC DEBUG] NEWEST ROW:', rows[0]);
        }
        if(!rows.length){
            console.log('[CFC DEBUG] ZERO ROWS');
            return [];
        }
        if(force && expectedSubmission && !rowsContainExpectedSubmission(rows, expectedSubmission)){
            console.log('[CFC DEBUG] EXPECTED NEW SUBMISSION NOT FOUND YET', {
                expectedSubmission,
                newestRow: rows[0],
            });

            return rows;
        }

        console.log('[CFC DEBUG] SENDING SUBMISSIONS SCRAPE', { count: rows.length, newest: rows[0] });

        await send({
            type: 'submissions_scrape',
            handle: loggedInHandle,
            rows,
            timestamp: Date.now(),
        });

        console.log('[CFC DEBUG] SUBMISSIONS SCRAPE SENT', { count: rows.length, newest: rows[0] });
        return rows;
    }

    
//-------------Pending Poll-----------------------------------------------
    const PENDING_KEY = 'cfCompanion.pendingPoll'; // {contestId, problemCode, handle, attempt}

    function markPendingPoll(contestId, problemCode, handle){
        try{
            sessionStorage.setItem(PENDING_KEY, JSON.stringify({ contestId, problemCode, handle, attempt: 0 }));
            if (handle) storeHandle(handle);
            console.log('[CFC DEBUG] PENDING POLL MARKED', { contestId, problemCode, handle });
        } 
        catch(err){
            console.error('[CFC DEBUG] Could not mark pending poll:', err);
        }
    }

    function clearPendingPoll(){
        try { sessionStorage.removeItem(PENDING_KEY); } catch (err) {}
    }

    function getPendingPoll(){
        try{
            const raw = sessionStorage.getItem(PENDING_KEY);
            return raw ? JSON.parse(raw) : null;
        }
        catch(err){
            return null;
        }
    }

    async function checkPendingPoll() {
        if (!isSubmissionsPage()) return;

        const pending = getPendingPoll();
        if (!pending) return; // nothing pending — do nothing, no reload, no scrape

        console.log('[CFC DEBUG] RESUMING PENDING POLL', pending);
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const rows = await scrapeSubmissionsIfRelevant(true, pending, pending.handle);

        const row = rows.find((r) =>
            String(r.contestId) === String(pending.contestId) &&
            String(r.problemCode).toUpperCase() === String(pending.problemCode).toUpperCase()
        );

        const resolved = row && !isPendingVerdict(row.verdict);

        if(resolved){
            console.log('[CFC DEBUG] VERDICT FINAL — STOPPING POLL', row);
            clearPendingPoll();
            return;
        }

        if(pending.attempt + 1 >= POST_SUBMIT_MAX_ATTEMPTS){
            console.log('[CFC DEBUG] PENDING POLL GAVE UP', { attempts: pending.attempt + 1, pending });
            clearPendingPoll();
            return;
        }

        pending.attempt += 1;
        try {
            sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        } 
        catch (err) {}

        console.log('[CFC DEBUG] VERDICT STILL PENDING', {
            nextAttempt: pending.attempt,
            retryIn: POST_SUBMIT_POLL_INTERVAL_MS,
        });

        setTimeout(() => { location.reload(); }, POST_SUBMIT_POLL_INTERVAL_MS);
    }

    async function scrapeOnceOnLoad() {
        if (!isSubmissionsPage()) return;

        const handle = getStoredHandle();
        if (!handle) return;

        await scrapeSubmissionsIfRelevant(false, null, handle);
        await checkPendingPoll();
    }

//---------------Compiler List Extractor-------------------------------------
    function getCompilerOptions() {
        const select = document.querySelector('select[name="programTypeId"]');
        if (!select) return null;

        return Array.from(select.options)
            .filter((o) => o.value)
            .map((o) => o.textContent.trim());
    }
    function reportCompilersIfOnSubmitPage(){
        if (!/\/submit\/?$/i.test(location.pathname)) return;
        const compilers = getCompilerOptions();
        if(!compilers || !compilers.length) return;
        send({ type: 'compiler_list', compilers, timestamp: Date.now() });
    }

//------------------Init--------------------------------------------------------------
    function init() {
        if (isExtractorPage()) {
            initExtractor();
        }
        reportCompilersIfOnSubmitPage();
        setInterval(pollSubmitOnce, SUBMIT_POLL_INTERVAL_MS);
        pollSubmitOnce();
        scrapeOnceOnLoad();
    }

    if(document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } 
    else{
        init();
    }
})();