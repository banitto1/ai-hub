import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {extractFile} from '../lib/extract-file.mjs';
const require=createRequire(import.meta.url);const mr=createRequire(require.resolve('mammoth'));const JSZip=mr('jszip');
test('extract PDF and DOCX content; reject unsupported/empty files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hub-files-'));
 const stream='BT /F1 18 Tf 50 750 Td (Cobalt document) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const p=join(dir,'file');await writeFile(p,pdf);assert.match((await extractFile({name:'proof.pdf',storage_path:p})).text,/Cobalt document/);
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Cobalt DOCX</w:t></w:r></w:p></w:body></w:document>');await writeFile(p,await zip.generateAsync({type:'nodebuffer'}));assert.match((await extractFile({name:'proof.docx',storage_path:p})).text,/Cobalt DOCX/);
 await assert.rejects(extractFile({name:'file.exe',storage_path:p}),/Поддерживаются/);await writeFile(p,'');await assert.rejects(extractFile({name:'blank.txt',storage_path:p}),/не найден текст/);
});
