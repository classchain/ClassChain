#!/usr/bin/env python3
# Run from repo root: python3 scripts/patch_admin_indexer_ui.py
from pathlib import Path
import sys

p = Path("Admin/index.html")
if not p.exists():
    print("Admin/index.html not found — run from repo root")
    sys.exit(1)

html = p.read_text(encoding="utf-8")
if "section-disburse" in html:
    print("Admin/index.html already has indexer sections")
    sys.exit(0)

needle = '<a href="#" data-section="settings">'
insert_nav = (
    '<a href="#" data-section="community">جامعه / FIFO</a>\n'
    '                    <a href="#" data-section="voting">رای‌گیری</a>\n'
    '                    <a href="#" data-section="disburse">تخصیص خزانه</a>\n'
    '                    <a href="#" data-section="settings">'
)
if needle not in html:
    print("settings nav link not found")
    sys.exit(1)
html = html.replace(needle, insert_nav, 1)

SECTIONS = r'''
                <section id="section-community" class="section" style="display:none;">
                    <h2>جامعه مشارکت‌کنندگان و صف FIFO</h2>
                    <div class="form-group" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
                        <label>شبکه:</label>
                        <select id="communityNetwork">
                            <option value="">همه</option>
                            <option value="polygon_amoy">polygon_amoy</option>
                            <option value="tron_nile">tron_nile</option>
                        </select>
                        <button type="button" id="communityRefreshBtn" class="btn-secondary">بروزرسانی</button>
                    </div>
                    <h3>Contributors (unallocated &gt; 0)</h3>
                    <div id="communityContributors"></div>
                    <h3 style="margin-top:24px;">صف FIFO</h3>
                    <div id="communityQueue"></div>
                    <h3 style="margin-top:24px;">جستجوی donor</h3>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                        <input type="text" id="communityLookupDonor" placeholder="0x... یا T..." style="flex:1;min-width:220px;padding:8px;">
                        <input type="text" id="communityLookupNetwork" value="polygon_amoy" style="width:140px;padding:8px;">
                        <button type="button" id="communityLookupBtn" class="btn-secondary">جستجو</button>
                    </div>
                    <div id="communityLookupResult"></div>
                </section>
                <section id="section-voting" class="section" style="display:none;">
                    <h2>رای‌گیری و تخصیص</h2>
                    <button type="button" id="votingRefreshBtn" class="btn-secondary">لیست راندها</button>
                    <div id="votingRoundsList" style="margin-top:12px;"></div>
                    <input type="hidden" id="votingSelectedRoundId" value="">
                    <div id="votingRoundDetail" style="margin-top:16px;"></div>
                    <hr style="margin:24px 0;">
                    <h3>باز کردن راند جدید</h3>
                    <div class="form-group">
                        <input type="text" id="votingNewTitle" placeholder="عنوان راند" style="width:100%;padding:8px;margin-bottom:8px;">
                        <input type="text" id="votingNewCandidates" placeholder="کاندیدها: 1004,1005,1090" style="width:100%;padding:8px;margin-bottom:8px;">
                        <select id="votingNewNetwork" style="padding:8px;">
                            <option value="polygon_amoy">polygon_amoy</option>
                            <option value="tron_nile">tron_nile</option>
                            <option value="">همه</option>
                        </select>
                        <button type="button" id="votingOpenBtn" class="btn-connect" style="margin-top:8px;">باز کردن راند</button>
                    </div>
                    <h3>ثبت رای</h3>
                    <div class="form-group" style="display:flex;flex-direction:column;gap:8px;max-width:480px;">
                        <input type="text" id="votingVoteDonor" placeholder="donor 0x...">
                        <input type="text" id="votingVoteNetwork" value="polygon_amoy">
                        <input type="text" id="votingVoteProject" placeholder="project_id">
                        <button type="button" id="votingVoteBtn" class="btn-secondary">رای بده</button>
                    </div>
                    <h3>بستن راند + allocate</h3>
                    <div class="form-group" style="display:flex;flex-direction:column;gap:8px;max-width:480px;">
                        <input type="text" id="votingCloseProject" placeholder="selected_project_id">
                        <input type="text" id="votingCloseAmount" placeholder="required_amount_raw">
                        <div style="display:flex;gap:8px;">
                            <button type="button" id="votingCloseBtn" class="btn-secondary">بستن</button>
                            <button type="button" id="votingAllocateBtn" class="btn-connect">Allocate</button>
                        </div>
                    </div>
                </section>
                <section id="section-disburse" class="section" style="display:none;">
                    <h2>انتقال از خزانه عمومی</h2>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0;">
                        <select id="disburseNetworkFilter">
                            <option value="">همه</option>
                            <option value="polygon_amoy">polygon_amoy</option>
                            <option value="tron_nile">tron_nile</option>
                        </select>
                        <button type="button" id="disburseRefreshBtn" class="btn-secondary">بروزرسانی</button>
                    </div>
                    <div class="form-group">
                        <label>Approver:</label>
                        <input type="text" id="disburseApprover" placeholder="0x..." style="width:100%;max-width:420px;padding:8px;">
                    </div>
                    <div id="disbursePendingList"></div>
                    <h3 style="margin-top:24px;">جزئیات</h3>
                    <input type="hidden" id="disburseDetailId" value="">
                    <div id="disburseDetailBox"></div>
                    <hr style="margin:24px 0;">
                    <h3>Prepare دستی</h3>
                    <div style="display:flex;flex-direction:column;gap:8px;max-width:480px;">
                        <input type="text" id="disburseBatchId" placeholder="allocation_batch_id">
                        <input type="text" id="disburseProjectId" placeholder="project_id">
                        <button type="button" id="disbursePrepareBtn" class="btn-secondary">Prepare</button>
                    </div>
                </section>
'''

if 'id="section-settings"' in html:
    html = html.replace(
        '<section id="section-settings"',
        SECTIONS + '\n                <section id="section-settings"',
        1,
    )
else:
    print("section-settings not found")
    sys.exit(1)

MODULE = '''
    <script type="module">
        import { initCommunityPanel, loadContributors, loadQueue } from './js/community.js';
        import { initVotingPanel, loadVotingRounds } from './js/voting.js';
        import { initDisbursePanel, loadDisbursePending } from './js/disburse.js';
        import { setIndexerSecret } from './js/config/indexer.js';
        document.addEventListener('DOMContentLoaded', () => {
            initCommunityPanel();
            initVotingPanel();
            initDisbursePanel();
            document.getElementById('saveIndexerSecretBtn')?.addEventListener('click', () => {
                const v = document.getElementById('indexerSecret')?.value;
                if (v && v.trim()) {
                    setIndexerSecret(v.trim());
                    alert('Indexer secret saved');
                    document.getElementById('indexerSecret').value = '';
                }
            });
            document.querySelectorAll('.sidebar-nav a').forEach(link => {
                link.addEventListener('click', function () {
                    const section = this.dataset.section;
                    if (section === 'community') { loadContributors(); loadQueue(); }
                    if (section === 'voting') loadVotingRounds();
                    if (section === 'disburse') loadDisbursePending();
                });
            });
        });
    </script>
'''

if "initDisbursePanel" not in html:
    if '<script type="module" src="js/app.js"></script>' in html:
        html = html.replace(
            '<script type="module" src="js/app.js"></script>',
            '<script type="module" src="js/app.js"></script>\n' + MODULE,
            1,
        )
    else:
        html = html.replace("</body>", MODULE + "\n</body>", 1)

if "indexerSecret" not in html:
    secret_block = '''
                    <div class="settings-group" style="background:white;padding:20px;border-radius:10px;margin-top:16px;">
                        <h3>Indexer Secret</h3>
                        <p style="color:#666;font-size:13px;">X-Indexer-Secret for admin APIs</p>
                        <div style="display:flex;gap:10px;margin-top:10px;">
                            <input type="password" id="indexerSecret" placeholder="secret" style="flex:1;padding:10px;border:2px solid #e0e0e0;border-radius:8px;">
                            <button type="button" id="saveIndexerSecretBtn" style="padding:10px 20px;background:#16a085;color:white;border:none;border-radius:8px;cursor:pointer;">Save</button>
                        </div>
                    </div>
'''
    idx = html.find('id="section-settings"')
    if idx > 0:
        end = html.find("</section>", idx)
        if end > 0:
            html = html[:end] + secret_block + html[end:]

p.write_text(html, encoding="utf-8")
print("Patched", p.resolve())
