"""
A股盈亏复盘 - 桌面应用主程序
使用 pywebview 创建无边框窗口
"""
import webview
import os
import sys
import time
import threading
import json
from typing import TYPE_CHECKING, Optional, List, Any

# 运行时使用真实模块
if not TYPE_CHECKING:
    from webview import Window

def resource_path(relative_path: str) -> str:
    """获取资源的绝对路径"""
    base_path: str = getattr(sys, '_MEIPASS', os.path.abspath("."))
    return os.path.join(base_path, relative_path)

class API:
    """前端 JavaScript API 接口"""
    
    def __init__(self):
        self._is_maximized: bool = False
    
    def log(self, message: str) -> None:
        print(f"[Frontend Log]: {message}")

    def get_version(self) -> str:
        return "Python App v1.7 (Doc Storage)"
    
    # --- 新增：数据存储逻辑 ---
    def get_doc_data_path(self) -> str:
        """获取用户文档下的数据文件路径"""
        # 获取用户文档目录: ~/Documents
        docs_dir = os.path.join(os.path.expanduser("~"), "Documents")
        # 创建子文件夹: ~/Documents/A股盈亏复盘
        app_dir = os.path.join(docs_dir, "A股盈亏复盘")
        
        if not os.path.exists(app_dir):
            try:
                os.makedirs(app_dir)
            except Exception as e:
                print(f"创建数据目录失败: {e}")
                return ""
        
        return os.path.join(app_dir, "data.json")

    def load_user_data(self) -> str:
        """从文档目录读取 data.json"""
        file_path = self.get_doc_data_path()
        if not file_path or not os.path.exists(file_path):
            return "" # 返回空字符串，前端会处理初始化
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"读取数据失败: {e}")
            return ""

    def save_user_data(self, content: str) -> bool:
        """保存数据到文档目录"""
        file_path = self.get_doc_data_path()
        if not file_path:
            return False
            
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"数据已自动保存至: {file_path}")
            return True
        except Exception as e:
            print(f"保存数据失败: {e}")
            return False
    # -----------------------

    def minimize_window(self) -> None:
        windows: List[webview.Window] = webview.windows
        if windows:
            windows[0].minimize()

    def maximize_window(self) -> None:
        windows: List[webview.Window] = webview.windows
        if windows:
            window = windows[0]
            if sys.platform == 'darwin':
                window.toggle_fullscreen()
            else:
                if self._is_maximized:
                    window.restore()
                    self._is_maximized = False
                else:
                    window.maximize()
                    self._is_maximized = True

    def close_window(self) -> None:
        """安全关闭窗口 - 前端请求关闭时调用"""
        windows: List[webview.Window] = webview.windows
        if windows:
            window = windows[0]
            # 触发前端确认
            window.evaluate_js("window.dispatchEvent(new CustomEvent('app-close-request'))")

    def destroy_app(self) -> None:
        """强制销毁应用（前端确认后调用）"""
        windows: List[webview.Window] = webview.windows
        if windows:
            window = windows[0]
            if hasattr(window.events, 'closing'):
                window.events.closing -= on_closing
            window.destroy()
            import os
            os._exit(0)

    def save_file(self, content: str, filename: str) -> None:
        """手动导出备份文件"""
        windows: List[webview.Window] = webview.windows
        if windows:
            window = windows[0]
            try:
                result = window.create_file_dialog(
                    webview.SAVE_DIALOG, # type: ignore
                    directory='', 
                    save_filename=filename
                )
                
                file_path = None
                if result:
                    if isinstance(result, (list, tuple)) and len(result) > 0:
                        file_path = result[0]
                    elif isinstance(result, str):
                        file_path = result
                
                if file_path:
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(content)
                    window.evaluate_js(f"alert('备份成功！文件已保存至: {os.path.basename(file_path)}')")
            except Exception as e:
                print(f"保存文件失败: {e}")
                window.evaluate_js(f"alert('保存失败: {str(e)}')")

def on_closing():
    print("Window closing intercepted...")
    windows = webview.windows
    if windows:
        windows[0].evaluate_js("window.dispatchEvent(new CustomEvent('app-close-request'))")
    return False

def main() -> None:
    dist_path = resource_path('dist')
    entry_html = os.path.join(dist_path, 'index.html')

    api = API()

    # 确保存储目录存在 (pywebview 自身的缓存)
    user_home = os.path.expanduser("~")
    app_data_dir = os.path.join(user_home, '.agu_yingkui_data')
    if not os.path.exists(app_data_dir):
        try: os.makedirs(app_data_dir)
        except: pass

    window = webview.create_window(
        title='A股盈亏复盘',
        url=entry_html,
        js_api=api,
        width=1200,
        height=900,
        resizable=True,
        min_size=(900, 650),
        frameless=True,
        confirm_close=True,
        easy_drag=False, # type: ignore
        transparent=False,
        background_color='#F2F2F7'
    )

    window.events.closing += on_closing

    webview.start(debug=False, storage_path=app_data_dir)

if __name__ == '__main__':
    main()