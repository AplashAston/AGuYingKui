// 全局类型声明，不使用 export
interface Window {
    pywebview?: {
        api: {
            minimize_window: () => void;
            maximize_window: () => void;
            close_window: () => void;
            log: (message: string) => void;
            get_version: () => string;
        };
    };
}

// 声明全局模块
declare namespace React {
    // 基本声明
}

declare namespace ReactDOM {
    // 基本声明
}