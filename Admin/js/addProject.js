// Admin/js/addProject.js
// منطق افزودن پروژه جدید

export function setupAddProject(projectManager, loadProjectsTable) {
  async function createNewProject() {
    const resultDiv = document.getElementById('addProjectResult');
    const btn = document.getElementById('btnAddProject');

    const projectId = document.getElementById('newProjectId')?.value?.trim();
    const name = document.getElementById('newProjectName')?.value?.trim();
    const target = document.getElementById('newTargetAmount')?.value;

    if (!projectId) {
      showAddProjectError('لطفاً ProjectID را وارد کنید');
      return;
    }
    if (!name) {
      showAddProjectError('لطفاً نام پروژه را وارد کنید');
      return;
    }
    if (target === '' || target == null || Number(target) < 0) {
      showAddProjectError('لطفاً هدف مالی معتبر وارد کنید');
      return;
    }

    const attributes = {
      ProjectID: projectId,
      'نام پروژه': name,
      'استان': document.getElementById('newProvince')?.value?.trim() || '',
      'منطقه': document.getElementById('newRegion')?.value?.trim() || '',
      'آدرس پروژه': document.getElementById('newAddress')?.value?.trim() || '',
      'تعداد کلاس': document.getElementById('newClassCount')?.value || 0,
      'زیربنا': document.getElementById('newArea')?.value || 0,
      'targetAmount(USDT)': target,
      x: document.getElementById('newX')?.value || 0,
      y: document.getElementById('newY')?.value || 0,
      'محل اجرا': document.getElementById('newLocationType')?.value || 'شهری',
      'ماهیت پروژه': document.getElementById('newNature')?.value?.trim() || 'خیرین',
      'نوع پروژه (نیاز)': document.getElementById('newProjectType')?.value?.trim() || 'احداث فضای آموزشی جهت ارتقاء سرانه فضا',
      'مسئول پروژه': document.getElementById('newManager')?.value?.trim() || '',
      'شماره تلفن مسئول پروژه': document.getElementById('newManagerPhone')?.value?.trim() || '',
      'کد فضا': document.getElementById('newSpaceCode')?.value?.trim() || '',
      'وضعیت راهبری پروژه': ''
    };

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ در حال ذخیره...';
    }

    try {
      await projectManager.addProject(attributes);
      const updatedJson = await projectManager.saveProjects();

      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = '#e8f5e9';
        resultDiv.style.border = '2px solid #27ae60';
        resultDiv.style.padding = '20px';
        resultDiv.style.borderRadius = '10px';
        resultDiv.innerHTML = `
          <h3 style="color:#27ae60;margin-top:0;">✅ پروژه با موفقیت اضافه شد</h3>
          <p><strong>ProjectID:</strong> ${projectId}</p>
          <p><strong>نام:</strong> ${name}</p>
          <hr style="margin:16px 0;border:1px solid #ddd;">
          <textarea id="jsonOutputAdd" style="width:100%;height:220px;font-family:monospace;font-size:12px;direction:ltr;padding:10px;border:1px solid #ddd;border-radius:6px;background:#f8f9fa;">${updatedJson}</textarea>
          <div style="margin-top:15px;display:flex;gap:10px;flex-wrap:wrap;">
            <button onclick="window.pushNewProjectToGitHub()" style="padding:10px 20px;background:#6c5ce7;color:white;border:none;border-radius:6px;cursor:pointer;">
              🚀 آپلود به GitHub
            </button>
            <button onclick="window.goToCreateFund('${projectId}')" style="padding:10px 20px;background:#27ae60;color:white;border:none;border-radius:6px;cursor:pointer;">
              🏗️ ساخت خزانه برای این پروژه
            </button>
          </div>
        `;
      }

      if (typeof loadProjectsTable === 'function') {
        await loadProjectsTable();
      }
    } catch (error) {
      console.error('❌ خطا در افزودن پروژه:', error);
      showAddProjectError(error.message || 'خطای نامشخص');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 ذخیره پروژه جدید';
      }
    }
  }

  function showAddProjectError(message) {
    const resultDiv = document.getElementById('addProjectResult');
    if (!resultDiv) return;
    resultDiv.style.display = 'block';
    resultDiv.style.background = '#fde8e8';
    resultDiv.style.border = '2px solid #e74c3c';
    resultDiv.style.padding = '20px';
    resultDiv.style.borderRadius = '10px';
    resultDiv.innerHTML = `<span style="color:#e74c3c;">❌ ${message}</span>`;
  }

  window.createNewProject = createNewProject;

  window.pushNewProjectToGitHub = async () => {
    const textarea = document.getElementById('jsonOutputAdd');
    if (!textarea) return;
    try {
      const btn = event?.target;
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ در حال آپلود...';
      }
      await projectManager.pushToGitHub(textarea.value, 'افزودن پروژه جدید از پنل ادمین');
      alert('✅ فایل با موفقیت به GitHub آپلود شد!');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🚀 آپلود به GitHub';
      }
    } catch (error) {
      console.error(error);
      alert('❌ خطا در آپلود: ' + (error.message || 'نامشخص'));
      const btn = event?.target;
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🚀 آپلود به GitHub';
      }
    }
  };

  window.goToCreateFund = (projectId) => {
    document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
    const createLink = document.querySelector('[data-section="create"]');
    if (createLink) createLink.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    const createSection = document.getElementById('section-create');
    if (createSection) createSection.style.display = 'block';
    const input = document.getElementById('projectId');
    if (input) {
      input.value = projectId;
      if (typeof window.checkProject === 'function') {
        window.checkProject();
      }
    }
  };

  // Attach event
  const addProjectBtn = document.getElementById('btnAddProject');
  if (addProjectBtn) {
    addProjectBtn.addEventListener('click', createNewProject);
  }
}
