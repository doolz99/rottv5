const tagInput = document.getElementById('tagInput');
const tagsDisplay = document.getElementById('tagsDisplay');
let tags = [];

function renderTags(){
  tagsDisplay.innerHTML = '';
  tags.forEach(t=>{
    const span=document.createElement('span');
    span.className='tag-pill';
    span.textContent=t;
    tagsDisplay.appendChild(span);
  });
}

tagInput.addEventListener('input', ()=>{
  const raw = tagInput.value.split(',');
  tags = Array.from(new Set(raw.map(x=>x.trim().toLowerCase()).filter(Boolean)));
  renderTags();
});

document.getElementById('startRandom').addEventListener('click', ()=>{
  sessionStorage.setItem('mode','random');
  sessionStorage.removeItem('tags');
  window.location.href='/chat';
});

document.getElementById('startTags').addEventListener('click', ()=>{
  sessionStorage.setItem('mode','tags');
  sessionStorage.setItem('tags', JSON.stringify(tags));
  window.location.href='/chat';
});
