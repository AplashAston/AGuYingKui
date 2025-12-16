// 全局类型声明，不重复声明 React 和 ReactDOM
import React from 'react';
import ReactDOM from 'react-dom';

// 扩展全局命名空间
declare global {
    namespace JSX {
        interface IntrinsicElements {
            [elemName: string]: any;
        }
    }
}

// 声明 lucide-react 图标
declare module 'lucide-react' {
    export const Settings: React.FC<any>;
    export const Plus: React.FC<any>;
    export const Trash2: React.FC<any>;
    export const Edit3: React.FC<any>;
    export const AlertCircle: React.FC<any>;
    export const X: React.FC<any>;
    export const Save: React.FC<any>;
    export const Info: React.FC<any>;
    export const DollarSign: React.FC<any>;
    export const PieChart: React.FC<any>;
    export const ArrowRightLeft: React.FC<any>;
    export const ChevronDown: React.FC<any>;
    export const Briefcase: React.FC<any>;
    export const FolderPlus: React.FC<any>;
    export const Calculator: React.FC<any>;
    export const Download: React.FC<any>;
    export const Upload: React.FC<any>;
    export const Pencil: React.FC<any>;
    export const Calendar: React.FC<any>;
    export const Sun: React.FC<any>;
    export const Moon: React.FC<any>;
    export const Clock: React.FC<any>;
    export const Check: React.FC<any>;
    export const MoreHorizontal: React.FC<any>;
    export const Minus: React.FC<any>;
    export const Square: React.FC<any>;
}