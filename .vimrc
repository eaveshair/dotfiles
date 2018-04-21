""" Using vundle
set nocompatible              " be iMproved, required
filetype off                  " required

" set the runtime path to include Vundle and initialize
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()
" alternatively, pass a path where Vundle should install plugins
"call vundle#begin('~/some/path/here')

" let Vundle manage Vundle, required
Plugin 'VundleVim/Vundle.vim'

" The following are examples of different formats supported.
" Keep Plugin commands between vundle#begin/end.
" plugin on GitHub repo
Plugin 'tpope/vim-fugitive'
Plugin 'scrooloose/syntastic'
Plugin 'Valloric/YouCompleteMe'
Plugin 'scrooloose/nerdtree' 
Plugin 'scrooloose/nerdcommenter'
Plugin 'octol/vim-cpp-enhanced-highlight'
" Status bar on bottom
Plugin 'bling/vim-airline'
Plugin 'vim-airline/vim-airline-themes'
" themes
Plugin 'morhetz/gruvbox'
Plugin 'gilgigilgil/anderson.vim'
" plugin from http://vim-scripts.org/vim/scripts.html
" Plugin 'L9'
" Git plugin not hosted on GitHub
Plugin 'git://git.wincent.com/command-t.git'
" git repos on your local machine (i.e. when working on your own plugin)
" Plugin 'file:///home/gmarik/path/to/plugin'
" The sparkup vim script is in a subdirectory of this repo called vim.
" Pass the path to set the runtimepath properly.
Plugin 'rstacruz/sparkup', {'rtp': 'vim/'}
" Install L9 and avoid a Naming conflict if you've already installed a
" different version somewhere else.
" Plugin 'ascenator/L9', {'name': 'newL9'}

" All of your Plugins must be added before the following line
call vundle#end()            " required
filetype plugin indent on    " required
" To ignore plugin indent changes, instead use:
"filetype plugin on
"
" Brief help
" :PluginList       - lists configured plugins
" :PluginInstall    - installs plugins; append `!` to update or just :PluginUpdate
" :PluginSearch foo - searches for foo; append `!` to refresh local cache
" :PluginClean      - confirms removal of unused plugins; append `!` to auto-approve removal
"
" see :h vundle for more details or wiki for FAQ
" Put your non-Plugin stuff after this line
"""

" Test setting | Try to make vim beauty
"set termguicolors
set t_Co=256
set background=dark
let g:gruvbox_italic=1
colorscheme gruvbox
let g:gruvbox_contrast_dark="hard"
"set background=light
"let g:gruvbox_contrast_light="hard"
set guifont=Monospace\ 10
set fillchars+=vert:\$
:set guioptions-=m "remove menu bar
:set guioptions-=T "remove toolbar
:set guioptions-=r "remove right scroll bar
:set guioptions-=L "remove left scroll bar
"set termguicolors

" Default settings
set autoindent
set number      "linenumber
set bs=2        "backspace should work as we expect
set hlsearch    "hightlight search result
set incsearch
set ignorecase

" Color theme
syntax on
filetype plugin on

" Tab settings
set expandtab
set softtabstop=4
set shiftwidth=4    "tab size = 4
set shiftround      "when shifting non-aligned set of lines, align them to next tabstop

" Searching
set incsearch   "show first match when start typing
set ignorecase  "ignore case-sensitive
set smartcase   "use case-sensitive if I use uppercase

" Hotkey
map <C-t> :NERDTreeToggle<cr>
noremap <A-up> :m -2 <cr>
noremap <A-down> :m +1 <cr>

" YouCompleteMe
"let g:ycm_global_ycm_extra_conf = '~/.ycm_extra_conf.py'


" C/C++:
function! CPPSET()
    set nowrap
    let g:ycm_global_ycm_extra_conf = '~/.ycm_extra_conf.py'
    nnoremap <buffer> <F9> :w<cr>:!g++ % -Wall -Wextra  -O2 -o %< -std=c++11 -I ./<cr>
endfunction

autocmd FileType cpp call CPPSET()
