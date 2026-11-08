"use client";
import {memo} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const components={img:({alt}:{alt?:string})=><span className="muted">[{alt||'Изображение'}]</span>,a:({href,children}:any)=><a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>};
export default memo(function MessageMarkdown({text}:{text:string}){return <Markdown remarkPlugins={[remarkGfm]} components={components}>{text}</Markdown>;});
