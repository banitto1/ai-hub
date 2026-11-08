import {readFile} from 'node:fs/promises';
import {PDFParse} from 'pdf-parse';
import mammoth from 'mammoth';
export async function extractFile(file){
 const buffer=await readFile(file.storage_path);
 if(/\.(png|jpe?g)$/i.test(file.name)&&buffer.length<=10*1024*1024)return {image:file.storage_path};
 let text='';
 if(/\.(txt|md|csv|json|log|ts|tsx|js|py|html|css)$/i.test(file.name)&&buffer.length<=300000)text=buffer.toString('utf8');
 else if(/\.pdf$/i.test(file.name)&&buffer.length<=20*1024*1024){const pdf=new PDFParse({data:buffer});try{text=(await pdf.getText()).text;}finally{await pdf.destroy();}}
 else if(/\.docx$/i.test(file.name)&&buffer.length<=20*1024*1024)text=(await mammoth.extractRawText({buffer})).value;
 else throw new Error('Поддерживаются PDF, DOCX, PNG, JPG и текстовые файлы.');
 if(!text.trim())throw new Error('В файле '+file.name+' не найден текст. Для скана приложите страницы как изображения.');
 if(text.length>300000)throw new Error('В файле '+file.name+' больше 300 000 символов. Разделите документ.');
 return {text};
}
